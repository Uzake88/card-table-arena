import { createServer } from 'node:http';
import { loadRooms, saveRoom, deleteRoom } from './persistence';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { initial, reduce, CardfallState, Action } from '../lib/games/cardfall/engine';
import { publicProjection } from '../lib/games/cardfall/projection';
import { commandSchema } from '../lib/protocol';
import { normalizeSettings } from '../lib/games/catalog';
import { addPlayer, createLobby, projectRuntime, reduceRuntime, type RuntimeState, type RuntimeGameId, type RuntimeAction } from '../lib/games/runtime';

type Command = { type:'JOIN_ROOM'|'START_GAME'|'ASK'|'ANSWER'|'GUESS'|'CHAT'|'RESYNC'|'READY'|'HIT'|'STAND'|'DRAW'|'REVEAL'|'CHECK'|'BET'; commandId?:string; roomCode:string; playerId:string; sessionToken?:string; name?:string; gameId?:string; settings?:Record<string,string|number|boolean>; message?:string; lastVersion?:number; cardsPerPlayer?:number; targetId?:string; question?:string; yes?:boolean; cardId?:string; ready?:boolean; amount?:number };
type Client = { socket:WebSocket; playerId:string; roomCode:string; sessionToken:string };
type PlayerSession = { playerId:string; token:string };
type CommandRecord = { playerId:string; fingerprint:string };
type Room = { code:string; hostId:string; gameId:string; settings:Record<string,string|number|boolean>; state:CardfallState|RuntimeState; version:number; clients:Set<Client>; sessions:Map<string,PlayerSession>; seen:Map<string,CommandRecord>; presence:Set<string> };
const rooms=new Map<string,Room>();
// Restore persisted rooms from disk (survives server restarts)
const persistedRooms = loadRooms();
for (const [code, data] of persistedRooms) {
  rooms.set(code, {
    code: data.code,
    hostId: data.hostId,
    gameId: data.gameId,
    settings: data.settings,
    state: data.state as CardfallState | RuntimeState,
    version: data.version,
    clients: new Set(),
    sessions: new Map(data.sessions.map(s => [s.playerId, { playerId: s.playerId, token: s.token }])),
    seen: new Map(),
    presence: new Set(),
  });
}
console.log(`Restored ${persistedRooms.size} room(s) from disk`);
const makeRoom=(code:string):Room=>{const r:Room={code,hostId:'',gameId:'cardfall',settings:normalizeSettings('cardfall',{}),state:initial([]),version:0,clients:new Set(),sessions:new Map(),seen:new Map(),presence:new Set()}; rooms.set(code,r); return r;};
const getRoom=(code:string)=>rooms.get(code)??makeRoom(code);
function detachSocket(socket:WebSocket){for(const r of rooms.values())for(const c of [...r.clients])if(c.socket===socket)r.clients.delete(c);}
function send(c:Client,r:Room){const state=r.gameId==='cardfall'?publicProjection(r.state as CardfallState,c.playerId):projectRuntime(r.state as RuntimeState,c.playerId);c.socket.send(JSON.stringify({type:'STATE',version:r.version,hostId:r.hostId,gameId:r.gameId,settings:r.settings,state,presence:[...r.presence]}));}
function broadcast(r:Room){saveRoom({code:r.code,hostId:r.hostId,gameId:r.gameId,settings:r.settings,state:r.state,version:r.version,sessions:[...r.sessions.entries()].map(([playerId])=>({playerId,token:r.sessions.get(playerId)!.token}))});for(const c of r.clients)if(c.socket.readyState===WebSocket.OPEN)send(c,r);}
function actionFor(cmd:Command, room:Room):Action|undefined{if(cmd.type==='START_GAME')return{type:'START',cardsPerPlayer:Number(room.settings.cardsPerPlayer??5)};if(cmd.type==='ASK')return{type:'ASK',actorId:cmd.playerId,targetId:cmd.targetId!,question:cmd.question!};if(cmd.type==='ANSWER')return{type:'ANSWER',actorId:cmd.playerId,yes:!!cmd.yes};if(cmd.type==='GUESS')return{type:'GUESS',actorId:cmd.playerId,targetId:cmd.targetId!,cardId:cmd.cardId!};}
function validCommand(raw:unknown):Command{const parsed=commandSchema.safeParse(raw);if(!parsed.success)throw Error('Invalid room command');return parsed.data as Command;}
const http=createServer((_,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}))});
const wss=new WebSocketServer({server:http,maxPayload:64*1024});
wss.on('connection',socket=>{let client:Client|undefined; socket.on('message',raw=>{try{const cmd=validCommand(JSON.parse(raw.toString()));const r=getRoom(cmd.roomCode);
 if(cmd.type==='JOIN_ROOM'){
  if(!cmd.commandId)throw Error('commandId is required');
  let existing=cmd.sessionToken ? [...r.sessions.values()].find(s=>s.token===cmd.sessionToken) : undefined;
  if(cmd.sessionToken&&!existing)throw Error('Invalid player session');
  if(cmd.sessionToken&&existing&&cmd.playerId!==existing.playerId)throw Error('Player identity does not match session');
  if(!existing){if(r.state.phase!=='lobby')throw Error('This game has already started');if(r.state.players.length>=8)throw Error('Room is full');const canonicalId=randomUUID();if(!r.hostId){r.hostId=canonicalId;r.gameId=cmd.gameId||'cardfall';r.settings=r.gameId==='cardfall'?normalizeSettings('cardfall',cmd.settings??{}):cmd.settings||r.settings;r.state=r.gameId==='cardfall'?initial([]):createLobby(r.gameId as RuntimeGameId,r.settings);}const token=randomBytes(24).toString('hex');existing={playerId:canonicalId,token};r.sessions.set(canonicalId,existing);if(r.gameId==='cardfall')(r.state as CardfallState).players.push({id:canonicalId,name:(cmd.name||'Guest').trim().slice(0,24)||'Guest',hand:[],removed:[],correctGuesses:0});else r.state=addPlayer(r.state as RuntimeState,{id:canonicalId,name:(cmd.name||'Guest').trim().slice(0,24)||'Guest'});}
  detachSocket(socket); client={socket,playerId:existing.playerId,roomCode:r.code,sessionToken:existing.token}; for(const old of [...r.clients])if(old.playerId===client.playerId)r.clients.delete(old); r.clients.add(client); r.presence.add(client.playerId); socket.send(JSON.stringify({type:'WELCOME',sessionToken:client.sessionToken,playerId:client.playerId,hostId:r.hostId})); send(client,r); broadcast(r); return;
 }
 if(!client||client.playerId!==cmd.playerId)throw Error('Join the room first');
 const sessionClient=client;
 if(sessionClient.roomCode!==cmd.roomCode)throw Error('Socket is bound to another room');
 if(cmd.sessionToken!==sessionClient.sessionToken||r.sessions.get(sessionClient.playerId)?.token!==cmd.sessionToken)throw Error('Invalid player session');
 if(!cmd.commandId)throw Error('commandId is required');
 const fingerprint=JSON.stringify({...cmd,sessionToken:undefined});
 if(cmd.type==='RESYNC'){send(sessionClient,r);return;}
 if(cmd.type==='READY'){
  if(typeof cmd.ready!=='boolean')throw Error('Ready must be boolean');
  const player=(r.state as CardfallState).players.find(p=>p.id===sessionClient.playerId);
  if(!player)throw Error('Player is not in this room');
  const ready=cmd.ready;
  if(r.gameId==='cardfall'){
   const state=r.state as CardfallState;
   const players=state.players.map(p=>p.id===sessionClient.playerId?{...p,ready}:p);
   r.state={...state,players};
  } else {
   const state=r.state as RuntimeState;
   const players=state.players.map(p=>p.id===sessionClient.playerId?{...p,ready}:p);
   r.state={...state,players};
  }
  r.version++; r.seen.set(cmd.commandId,{playerId:sessionClient.playerId,fingerprint}); broadcast(r); return;
 }

 if(cmd.type==='BET'){
  if(typeof cmd.amount!=='number'||cmd.amount<1)throw Error('Bet amount must be at least 1');
  const amount=cmd.amount;
  if(r.gameId!=='blackjack'&&r.gameId!=='holdem')throw Error('Betting is not supported in this game');
  const actor=(r.state as RuntimeState).players.find(p=>p.id===sessionClient.playerId);
   if(!actor)throw Error('Player is not in this room');
   const chips=actor.chips??0;
   if(amount>chips)throw Error('Insufficient chips');
   if(r.gameId==='blackjack'){
    const bet=(r.state as RuntimeState).bets??{};
    const state={...r.state as RuntimeState,bets:{...bet,[sessionClient.playerId]:amount}};
    const allBet=state.players.every(p=>(state.bets?.[p.id]??0)>0);
    if(allBet){r.state=reduceRuntime(state,{type:'START',actorId:sessionClient.playerId,seed:Date.now()});}
    else{r.state=state;}
   } else {
    const currentPot: Array<{playerId:string;amount:number}> = Array.isArray((r.state as RuntimeState).pot) ? (r.state as RuntimeState).pot! : [];
    const existing=currentPot.find(p=>p.playerId===sessionClient.playerId);
    const next=existing?currentPot.map(p=>p.playerId===sessionClient.playerId?{...p,amount:p.amount+amount}:p):[...currentPot,{playerId:sessionClient.playerId,amount}];
    const state={...r.state as RuntimeState,pot:next};
    const required=Number((r.state as RuntimeState).settings?.startingChips??1000);
    const allBet=state.players.every(p=>{const b=next.find(x=>x.playerId===p.id);return b!=null&&b.amount>=required});
    if(allBet){r.state=reduceRuntime(state,{type:'START',actorId:sessionClient.playerId,seed:Date.now()});}
    else{r.state=state;}
   }
  r.version++;r.seen.set(cmd.commandId,{playerId:sessionClient.playerId,fingerprint});broadcast(r);return;
 }
 const prior=r.seen.get(cmd.commandId); if(prior){if(prior.playerId!==sessionClient.playerId||prior.fingerprint!==fingerprint)throw Error('Command id already used');send(sessionClient,r);return;}
 if(cmd.lastVersion!==undefined&&cmd.lastVersion!==r.version)throw Error('STALE_STATE');
 if(cmd.type==='CHAT'){
  const text=cmd.message?.trim(); if(!text)throw Error('Message cannot be empty');
  const player=r.state.players.find(p=>p.id===sessionClient.playerId); if(!player)throw Error('Player is not in this room');
  if(r.gameId==='cardfall'){
   const state=r.state as CardfallState;
   r.state={...state,events:[...state.events,{id:randomUUID(),kind:'chat',actorId:player.id,text:`${player.name}: ${text}`,tone:'chat'}]};
  } else {
   const state=r.state as RuntimeState;
   r.state={...state,events:[...state.events,{id:randomUUID(),text:`${player.name}: ${text}`,tone:'chat'}]};
  }
  r.version++; r.seen.set(cmd.commandId,{playerId:sessionClient.playerId,fingerprint}); broadcast(r); return;
 }
 if(cmd.type==='START_GAME'&&sessionClient.playerId!==r.hostId)throw Error('Only the host can deal');
 if(cmd.type==='START_GAME'&&r.state.phase!=='lobby')throw Error('The game has already started');
 if(cmd.type==='ANSWER'&&typeof cmd.yes!=='boolean')throw Error('Answer must be yes or no');
 if(r.gameId!=='cardfall'&&['HIT','STAND','DRAW','REVEAL','CHECK','START_GAME'].includes(cmd.type)){const runtimeAction:RuntimeAction=cmd.type==='START_GAME'?{type:'START',actorId:sessionClient.playerId,seed:Date.now()}:{type:cmd.type as RuntimeAction['type'],actorId:sessionClient.playerId};r.state=reduceRuntime(r.state as RuntimeState,runtimeAction);r.version++;r.seen.set(cmd.commandId,{playerId:sessionClient.playerId,fingerprint});broadcast(r);return;}
 const action=actionFor({...cmd,playerId:sessionClient.playerId},r);if(!action)throw Error('Unknown command');r.state=reduce(r.state as CardfallState,action);r.version++;r.seen.set(cmd.commandId,{playerId:sessionClient.playerId,fingerprint});broadcast(r);
 }catch(error){socket.send(JSON.stringify({type:'ERROR',message:(error as Error).message}))}}); socket.on('close',()=>{
  const closingClient=client;
  if(closingClient){
   const room=rooms.get(closingClient.roomCode);
   if(room){
    room.clients.delete(closingClient);
    room.presence.delete(closingClient.playerId);
    if(room.hostId===closingClient.playerId){
     const nextHost=[...room.clients].map(c=>c.playerId).find(id=>id!==closingClient.playerId);
     room.hostId=nextHost||'';
    }
    broadcast(room);
   }
  }
 });});
const port=Number(process.env.PORT||8787);http.listen(port,()=>console.log(`Card Table Arena realtime server listening on ${port}`));

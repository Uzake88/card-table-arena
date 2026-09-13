import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { initial, reduce, CardfallState, Action } from '../lib/games/cardfall/engine';
import { publicProjection } from '../lib/games/cardfall/projection';

type Command = { type:'JOIN_ROOM'|'START_GAME'|'ASK'|'ANSWER'|'GUESS'|'RESYNC'; commandId?:string; roomCode:string; playerId:string; sessionToken?:string; name?:string; lastVersion?:number; cardsPerPlayer?:number; targetId?:string; question?:string; yes?:boolean; cardId?:string };
type Client = { socket:WebSocket; playerId:string; roomCode:string; sessionToken:string };
type PlayerSession = { playerId:string; token:string };
type CommandRecord = { playerId:string; fingerprint:string };
type Room = { code:string; hostId:string; state:CardfallState; version:number; clients:Set<Client>; sessions:Map<string,PlayerSession>; seen:Map<string,CommandRecord> };
const rooms=new Map<string,Room>();
const makeRoom=(code:string):Room=>{const r:Room={code,hostId:'',state:initial([]),version:0,clients:new Set(),sessions:new Map(),seen:new Map()}; rooms.set(code,r); return r;};
const getRoom=(code:string)=>rooms.get(code)??makeRoom(code);
function detachSocket(socket:WebSocket){for(const r of rooms.values())for(const c of [...r.clients])if(c.socket===socket)r.clients.delete(c);}
function send(c:Client,r:Room){c.socket.send(JSON.stringify({type:'STATE',version:r.version,hostId:r.hostId,state:publicProjection(r.state,c.playerId)}));}
function broadcast(r:Room){for(const c of r.clients)if(c.socket.readyState===WebSocket.OPEN)send(c,r);}
function actionFor(cmd:Command):Action|undefined{if(cmd.type==='START_GAME')return{type:'START',cardsPerPlayer:cmd.cardsPerPlayer??5};if(cmd.type==='ASK')return{type:'ASK',actorId:cmd.playerId,targetId:cmd.targetId!,question:cmd.question!};if(cmd.type==='ANSWER')return{type:'ANSWER',actorId:cmd.playerId,yes:!!cmd.yes};if(cmd.type==='GUESS')return{type:'GUESS',actorId:cmd.playerId,targetId:cmd.targetId!,cardId:cmd.cardId!};}
function validCommand(c:Command){if(!c||typeof c.roomCode!=='string'||!/^[A-Z0-9-]{3,12}$/.test(c.roomCode)||typeof c.playerId!=='string'||c.playerId.length<8||c.playerId.length>80)throw Error('Invalid room command');}
const http=createServer((_,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}))});
const wss=new WebSocketServer({server:http});
wss.on('connection',socket=>{let client:Client|undefined; socket.on('message',raw=>{try{const cmd=JSON.parse(raw.toString()) as Command;validCommand(cmd);const r=getRoom(cmd.roomCode);
 if(cmd.type==='JOIN_ROOM'){
  if(!cmd.commandId)throw Error('commandId is required');
  let existing=cmd.sessionToken ? [...r.sessions.values()].find(s=>s.token===cmd.sessionToken) : undefined;
  if(cmd.sessionToken&&!existing)throw Error('Invalid player session');
  if(cmd.sessionToken&&existing&&cmd.playerId!==existing.playerId)throw Error('Player identity does not match session');
  if(!existing){if(r.state.phase!=='lobby')throw Error('This game has already started');if(r.state.players.length>=8)throw Error('Room is full');const canonicalId=randomUUID();if(!r.hostId)r.hostId=canonicalId;const token=randomBytes(24).toString('hex');existing={playerId:canonicalId,token};r.sessions.set(canonicalId,existing);r.state.players.push({id:canonicalId,name:(cmd.name||'Guest').trim().slice(0,24)||'Guest',hand:[],removed:[],correctGuesses:0});}
  detachSocket(socket); client={socket,playerId:existing.playerId,roomCode:r.code,sessionToken:existing.token}; for(const old of [...r.clients])if(old.playerId===client.playerId)r.clients.delete(old); r.clients.add(client); socket.send(JSON.stringify({type:'WELCOME',sessionToken:client.sessionToken,playerId:client.playerId,hostId:r.hostId})); send(client,r); broadcast(r); return;
 }
 if(!client||client.playerId!==cmd.playerId)throw Error('Join the room first');
 if(client.roomCode!==cmd.roomCode)throw Error('Socket is bound to another room');
 if(cmd.sessionToken!==client.sessionToken||r.sessions.get(client.playerId)?.token!==cmd.sessionToken)throw Error('Invalid player session');
 if(!cmd.commandId)throw Error('commandId is required');
 if(cmd.type==='RESYNC'){send(client,r);return;}
 const fingerprint=JSON.stringify({...cmd,sessionToken:undefined});
 const prior=r.seen.get(cmd.commandId); if(prior){if(prior.playerId!==client.playerId||prior.fingerprint!==fingerprint)throw Error('Command id already used');send(client,r);return;}
 if(cmd.lastVersion!==undefined&&cmd.lastVersion!==r.version)throw Error('STALE_STATE');
 if(cmd.type==='START_GAME'&&client.playerId!==r.hostId)throw Error('Only the host can deal');
 if(cmd.type==='START_GAME'&&r.state.phase!=='lobby')throw Error('The game has already started');
 if(cmd.type==='ANSWER'&&typeof cmd.yes!=='boolean')throw Error('Answer must be yes or no');
 const action=actionFor({...cmd,playerId:client.playerId});if(!action)throw Error('Unknown command');r.state=reduce(r.state,action);r.version++;r.seen.set(cmd.commandId,{playerId:client.playerId,fingerprint});broadcast(r);
 }catch(error){socket.send(JSON.stringify({type:'ERROR',message:(error as Error).message}))}}); socket.on('close',()=>{if(client)rooms.get(client.roomCode)?.clients.delete(client)});});
const port=Number(process.env.PORT||8787);http.listen(port,()=>console.log(`Card Table Arena realtime server listening on ${port}`));

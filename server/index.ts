import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { initial, reduce, CardfallState, Action } from '../lib/games/cardfall/engine';
import { createDeck, shuffle } from '../lib/cards/deck';

type Client = { socket: WebSocket; playerId: string; roomCode: string };
type Command = { type: 'JOIN_ROOM'|'START_GAME'|'ASK'|'ANSWER'|'GUESS'|'RESYNC'; commandId?: string; roomCode: string; playerId: string; name?: string; lastVersion?: number; cardsPerPlayer?: number; targetId?: string; question?: string; yes?: boolean; cardId?: string };
type Room = { code: string; state: CardfallState; version: number; clients: Set<Client>; seen: Set<string> };
const rooms = new Map<string, Room>();
const room = (code:string) => rooms.get(code) ?? (()=>{const r={code,state:initial([]),version:0,clients:new Set<Client>(),seen:new Set<string>()};rooms.set(code,r);return r})();
function projection(state:CardfallState, viewer:string){return {...state,players:state.players.map(p=>({...p,hand:p.id===viewer?p.hand:p.hand.map(()=>({id:'hidden',rank:'?',suit:'?'} as any))}))};}
function send(c:Client,r:Room){c.socket.send(JSON.stringify({type:'STATE',version:r.version,state:projection(r.state,c.playerId)}));}
function broadcast(r:Room){for(const c of r.clients) if(c.socket.readyState===WebSocket.OPEN)send(c,r)}
function actionFor(cmd:Command,r:Room):Action|undefined { if(cmd.type==='START_GAME') return {type:'START',cardsPerPlayer:cmd.cardsPerPlayer??5}; if(cmd.type==='ASK') return {type:'ASK',actorId:cmd.playerId,targetId:cmd.targetId!,question:cmd.question!}; if(cmd.type==='ANSWER') return {type:'ANSWER',actorId:cmd.playerId,yes:!!cmd.yes}; if(cmd.type==='GUESS') return {type:'GUESS',actorId:cmd.playerId,targetId:cmd.targetId!,cardId:cmd.cardId!}; return undefined; }
const http=createServer((_,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}))});
const wss=new WebSocketServer({server:http});
wss.on('connection',(socket)=>{let client:Client|undefined;socket.on('message',(raw)=>{try{const cmd=JSON.parse(raw.toString()) as Command;const r=room(cmd.roomCode);if(cmd.type==='JOIN_ROOM'){if(!r.state.players.some(p=>p.id===cmd.playerId)){if(r.state.players.length>=8)throw Error('Room is full');r.state.players.push({id:cmd.playerId,name:(cmd.name||'Guest').slice(0,24),hand:[],removed:[],correctGuesses:0});}client={socket,playerId:cmd.playerId,roomCode:r.code};r.clients.add(client);send(client,r);broadcast(r);return}if(!client||client.playerId!==cmd.playerId)throw Error('Join the room first');if(cmd.commandId&&r.seen.has(cmd.commandId)){send(client,r);return}if(cmd.commandId)r.seen.add(cmd.commandId);if(cmd.type==='RESYNC'){send(client,r);return}const action=actionFor(cmd,r);if(!action)throw Error('Unknown command');r.state=reduce(r.state,action);r.version++;broadcast(r);}catch(error){socket.send(JSON.stringify({type:'ERROR',message:(error as Error).message}))}});socket.on('close',()=>{if(client){const r=rooms.get(client.roomCode);r?.clients.delete(client)}})});
const port=Number(process.env.PORT||8787);http.listen(port,()=>console.log(`Card Table Arena realtime server listening on ${port}`));

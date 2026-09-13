'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createDeck } from '../lib/cards/deck';
import type { CardfallState } from '../lib/games/cardfall/engine';

type Screen = 'lobby' | 'room';
type ServerMessage = { type: 'WELCOME'; sessionToken: string; playerId: string; hostId: string } | { type: 'STATE'; version: number; hostId: string; state: CardfallState } | { type: 'ERROR'; message: string };

const PLAYER_KEY = 'card-table-player';
function stableId() { if (typeof window === 'undefined') return 'guest'; const saved = localStorage.getItem(PLAYER_KEY); if (saved) return saved; const id = crypto.randomUUID(); localStorage.setItem(PLAYER_KEY, id); return id; }
function roomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

export function TableView() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState('');
  const [state, setState] = useState<CardfallState | null>(null);
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [target, setTarget] = useState('');
  const [guess, setGuess] = useState('');
  const [tab, setTab] = useState<'ask'|'guess'>('ask');
  const [answering, setAnswering] = useState(false);
  const [hostId, setHostId] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const sessionToken = useRef('');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const screenRef = useRef<Screen>('lobby');

  const [me, setMe] = useState(stableId);
  const meRef = useRef(me);
  const cards = useMemo(() => createDeck(), []);

  const connect = async (nextRoom: string, displayName: string) => {
    const config = await fetch('/api/config', { cache: 'no-store' }).then(r=>r.json() as Promise<{realtimeUrl:string}>);
    const ws = new WebSocket(config.realtimeUrl);
    socket.current = ws;
    ws.onopen = () => { setConnected(true); reconnectAttempt.current=0; ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: nextRoom, playerId: meRef.current, sessionToken: sessionToken.current || undefined, commandId: crypto.randomUUID(), name: displayName })); };
    ws.onmessage = (event) => { const message = JSON.parse(event.data) as ServerMessage; if (message.type === 'WELCOME') { sessionToken.current=message.sessionToken; meRef.current=message.playerId; localStorage.setItem(PLAYER_KEY,message.playerId); setMe(message.playerId); setHostId(message.hostId); } else if (message.type === 'STATE') { setState(message.state); setVersion(message.version); setHostId(message.hostId); setAnswering(false); setError(''); } else { setAnswering(false); setError(message.message); if(message.message==='STALE_STATE') ws.send(JSON.stringify({type:'RESYNC',roomCode:nextRoom,playerId:meRef.current,sessionToken:sessionToken.current,commandId:crypto.randomUUID()})); } };
    ws.onerror = () => setError('Could not reach the table server. Is the realtime server running?');
    ws.onclose = () => { setConnected(false); if (screenRef.current==='room' && reconnectAttempt.current < 5) { const delay=Math.min(8000,500*Math.pow(2,reconnectAttempt.current++)); reconnectTimer.current=setTimeout(()=>connect(nextRoom,displayName),delay); } };
  };
  useEffect(() => () => { if(reconnectTimer.current)clearTimeout(reconnectTimer.current); socket.current?.close(); }, []);
  const send = (payload: Record<string, unknown>) => { if (!socket.current || socket.current.readyState !== WebSocket.OPEN) { setError('You are disconnected from the table.'); return; } const commandId=crypto.randomUUID(); socket.current.send(JSON.stringify({ ...payload, roomCode: room, playerId: meRef.current, sessionToken: sessionToken.current, commandId, lastVersion: version })); };
  const enter = (nextCode: string) => { const cleanName = name.trim().slice(0, 24) || 'Guest'; const nextRoom = nextCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12); if (!nextRoom) { setError('Enter a room code first.'); return; } setRoom(nextRoom); screenRef.current='room'; setScreen('room'); connect(nextRoom, cleanName); };
  const leave = () => { if(reconnectTimer.current)clearTimeout(reconnectTimer.current); reconnectAttempt.current=99; screenRef.current='lobby'; sessionToken.current=''; localStorage.removeItem(PLAYER_KEY); const freshId=crypto.randomUUID(); localStorage.setItem(PLAYER_KEY,freshId); meRef.current=freshId; setMe(freshId); socket.current?.close(); setState(null); setScreen('lobby'); setRoom(''); setError(''); };
  const active = state ? state.players[state.turn] : undefined;
  const local = state?.players.find(p => p.id === me);
  const opponents = state?.players.filter(p => p.id !== me) ?? [];
  const chooseTarget = target || opponents.find(p => p.hand.length)?.id || '';
  const play = (payload: Record<string, unknown>) => { send(payload); };
  const answer = (yes:boolean) => { if(answering)return; setAnswering(true); send({type:'ANSWER',yes}); };

  if (screen === 'lobby') return <div className="shell lobby-shell"><header className="topbar"><div className="brand"><span className="mark">✦</span><span>Card Table <b>Arena</b></span></div><span className="safe-pill">PLAY MONEY · FREE TO JOIN</span></header><main className="lobby"><div className="lobby-copy"><p className="eyebrow">A SOCIAL TABLETOP FOR GOOD COMPANY</p><h1>Bring your<br/><em>best bluff.</em></h1><p className="sub">A quiet table for loud guesses.<br/>No account. No stakes. Just cards.</p></div><div className="lobby-panel"><div className="panel-kicker">WELCOME TO THE TABLE</div><h2>How are you joining?</h2><label className="field-label">Your table name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex" maxLength={24}/></label><div className="lobby-actions"><button className="primary" onClick={()=>enter(roomCode())}>Create a table <span>→</span></button><div className="join-line"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={12}/><button className="secondary" onClick={()=>enter(code)}>Join</button></div></div>{error&&<p className="form-error">{error}</p>}<div className="lobby-note"><span>✦</span><p><b>Cardfall</b> is the first table. Deal five hidden cards, ask yes/no questions, and topple the exact cards you can find.</p></div></div></main><footer><span>PRIVATE ROOMS · NO TRACKING</span><span>Cardfall <i/> v0.2</span></footer></div>;

  return <div className="shell"><header className="topbar"><div className="brand"><button className="back-button" onClick={leave}>←</button><span className="mark">✦</span><span>Card Table <b>Arena</b></span></div><div className="mode"><span className={`live-dot ${connected?'online':''}`}/> CARD<span className="muted">FALL</span><span className="divider"/> ROOM <strong>{room}</strong></div><button className="ghost" onClick={()=>setError('Ask a player about their hidden cards, or guess an exact card.')} >Rules <span>?</span></button></header>
    <main className="arena"><div className="intro"><div><p className="eyebrow">A SOCIAL HIDDEN-CARD GAME</p><h1>Read the table.<br/><em>Topple the hand.</em></h1><p className="sub">Ask sharp questions. Make exact guesses.<br/>Leave no card standing.</p></div><div className="status-card"><span className={`pulse ${connected?'online':''}`}/><div><b>{state?.phase==='lobby'?'Waiting for players':state?.phase==='finished'?'Table complete':'Game in progress'}</b><small>{state?.players.length??0} players · {state?.cardsPerPlayer||5} cards each</small></div><span className="lock">{connected?'♢':'×'}</span></div></div>
      <section className="felt"><div className="felt-glow"/><div className="table-label"><span>ROUND {state?.phase==='playing'||state?.phase==='finished'?'01':'—'}</span><span className="turn-label">{active&&state?.phase==='playing'?`${active.name.toUpperCase()}'S TURN`:state?.phase==='finished'?'GAME COMPLETE':'WAITING FOR DEAL'}</span></div>
        {opponents.map((p,i)=><div className={`seat seat-${(i%2)+1}`} key={p.id}><div className="seat-head"><span className="avatar">{p.name[0]?.toUpperCase()}</span><div><b>{p.name}</b><small>{p.hand.length?`${p.hand.length} cards hidden`:state?.phase==='lobby'?'READY':'TOPPLED'}</small></div>{active?.id===p.id&&state?.phase==='playing'&&<span className="your-turn">TURN</span>}</div><div className="back-row">{Array.from({length:Math.min(p.hand.length||5,5)}).map((_,j)=><div className="mini-back" key={j}>✦</div>)}</div></div>)}
        <div className="center-stack"><div className="table-ring"/><div className="table-shadow"/><div className="discard"><span>✦</span><small>RESOLVED<br/>CARDS</small></div><div className="event-chip">{state?.events.at(-1)?.text??(state?.players.length&&state.players.length<2?'Share the room code to invite a player.':'The table is quiet.')}</div></div>
        <div className="my-seat"><div className="my-head"><div className="avatar you">{local?.name[0]?.toUpperCase()||'Y'}</div><div><b>{local?.name||name||'You'}</b><small>{local?.hand.length?`${local.hand.length} cards in hand`:'Waiting for deal'}</small></div><span className="score">{local?.correctGuesses||0} <small>TOPPLES</small></span></div><div className="hand">{local?.hand.length?local.hand.map(c=><div className="playing-card" key={c.id}><small>{c.rank}</small><strong className={c.suit==='♥'||c.suit==='♦'?'red':''}>{c.suit}</strong></div>):<div className="empty-hand">Your private hand appears here after the host deals.</div>}</div></div>
      </section>
      <section className="controls"><div className="control-head"><div><p className="eyebrow">YOUR MOVE</p><h2>{!state||state.phase==='lobby'?'Invite your table':state.phase==='finished'?'The table has spoken':active?.id===me?'Make your play':'Watching the table'}</h2></div>{state?.phase==='lobby'&&hostId===me&&<button className="primary" disabled={state.players.length<2} onClick={()=>send({type:'START_GAME',cardsPerPlayer:5})}>{state.players.length<2?'Need one more player':'Deal the cards'} <span>→</span></button>}{state?.phase==='lobby'&&hostId!==me&&<span className="waiting host-note">Waiting for the host to deal</span>}{state?.phase==='finished'&&<button className="secondary" onClick={leave}>Leave table</button>}{state?.phase==='playing'&&active?.id===me&&<div className="tabs"><button className={tab==='ask'?'selected':''} onClick={()=>setTab('ask')}>Ask a question</button><button className={tab==='guess'?'selected':''} onClick={()=>setTab('guess')}>Guess a card</button></div>}</div>
        {state?.phase==='lobby'&&<div className="waiting invite-box"><span className="invite-code">{room}</span><button className="secondary" onClick={()=>navigator.clipboard?.writeText(room)}>Copy room code</button><p>Send this code to the people you want at the table.</p></div>}
        {state?.phase==='playing'&&state.pendingQuestion?.targetId===me&&<div className="answer-panel"><p><b>{state.players.find(p=>p.id===state.pendingQuestion?.askerId)?.name}</b> asks: “{state.pendingQuestion.question}”</p><div><button className="yes-button" disabled={answering} onClick={()=>answer(true)}>Yes</button><button className="no-button" disabled={answering} onClick={()=>answer(false)}>No</button></div></div>}
        {state?.phase==='playing'&&active?.id===me&&!state.pendingQuestion&&<div className="action-panel">{tab==='ask'?<><label>Ask <select value={chooseTarget} onChange={e=>setTarget(e.target.value)}>{opponents.filter(p=>p.hand.length).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select> something about their hand</label><div className="input-row"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g. Do you have a red card?"/><button disabled={!question.trim()||!chooseTarget} onClick={()=>play({type:'ASK',targetId:chooseTarget,question})}>Ask <span>↗</span></button></div><p className="hint">They can only answer <b>YES</b> or <b>NO</b>. Questions are visible to everyone.</p></>:<><label>Guess a card in <select value={chooseTarget} onChange={e=>setTarget(e.target.value)}>{opponents.filter(p=>p.hand.length).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>’s hand</label><div className="input-row"><select value={guess} onChange={e=>setGuess(e.target.value)}><option value="">Choose a card…</option>{cards.map(c=><option value={c.id} key={c.id}>{c.rank}{c.suit}</option>)}</select><button disabled={!guess||!chooseTarget} onClick={()=>play({type:'GUESS',targetId:chooseTarget,cardId:guess})}>Make guess <span>↗</span></button></div><p className="hint">Correct guesses topple a card and send it to the resolved pile.</p></>}</div>}
        {state?.phase==='playing'&&active?.id!==me&&<div className="waiting">{active?.name} is thinking. The table will update when they make a move.</div>}
        {error&&<div className="form-error inline-error">{error}</div>}<div className="log">{state?.events.slice(-4).reverse().map(e=><div className={`log-item ${e.tone||''}`} key={e.id}><span className="log-dot"/><span>{e.text}</span></div>)}</div>
      </section>
    </main><footer><span>PLAY MONEY · JUST FOR FUN</span><span>{connected?'CONNECTED':'OFFLINE'} <i/> Cardfall 01</span></footer></div>;
}

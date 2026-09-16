'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card } from '../lib/cards/deck';
import { CardPicker } from './cardfall/CardPicker';
import { ToppledPool } from './cardfall/ToppledPool';
import { ToppleAnimation } from './cardfall/ToppleAnimation';
import { ActivityFeed } from './cardfall/ActivityFeed';
import { RulesDialog } from './RulesDialog';
import { NotebookPanel } from './cardfall/NotebookPanel';
import { BetPanel } from './cardfall/BetPanel';
import {
  addQuestionNote,
  loadNotebook,
  saveNotebook,
  setAnswer,
  toggleNote,
  updateAnnotation,
  clearNotebook,
  type NotebookNote,
} from '../lib/games/cardfall/notebook';
import type { CardfallState } from '../lib/games/cardfall/engine';
import type { RuntimeState } from '../lib/games/runtime';
import { GAME_CATALOG, defaultSettings, gameById, normalizeSettings, type GameId } from '../lib/games/catalog';

type Screen = 'lobby' | 'room';
type State = CardfallState | RuntimeState;
type ServerMessage =
  | { type: 'WELCOME'; sessionToken: string; playerId: string; hostId: string }
  | { type: 'STATE'; version: number; hostId: string; gameId: GameId; state: State; presence?: string[] }
  | { type: 'ERROR'; message: string };

const PLAYER_KEY = 'card-table-player';

function stableId() {
  if (typeof window === 'undefined') return 'guest';
  const saved = localStorage.getItem(PLAYER_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(PLAYER_KEY, id);
  return id;
}

function roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function displayCard(card: Card) {
  return card.id === 'hidden' ? 'Hidden card' : `${card.rank}${card.suit}`;
}

export function TableView() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameId>('cardfall');
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>(() => defaultSettings('cardfall'));
  const selectedDefinition = gameById(selectedGame);
  const [room, setRoom] = useState('');
  const [state, setState] = useState<State | null>(null);
  const [roomGame, setRoomGame] = useState<GameId>('cardfall');
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [target, setTarget] = useState('');
  const [guessResetKey, setGuessResetKey] = useState(0);
  const [guessPending, setGuessPending] = useState(false);
  const pendingGuess = useRef<{ targetId: string; cardId: string } | null>(null);
  const [tab, setTab] = useState<'ask' | 'guess'>('ask');
  const [answering, setAnswering] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookNotes, setNotebookNotes] = useState<NotebookNote[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostId, setHostId] = useState('');
  const [presence, setPresence] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const sessionToken = useRef('');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const screenRef = useRef<Screen>('lobby');
  const [me, setMe] = useState(stableId);
  const meRef = useRef(me);

  const connect = async (nextRoom: string, displayName: string, gameId: GameId, gameSettings: Record<string, string | number | boolean>) => {
    const config = await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json() as Promise<{ realtimeUrl: string }>);
    const ws = new WebSocket(config.realtimeUrl);
    socket.current = ws;
    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM', roomCode: nextRoom, playerId: meRef.current,
        sessionToken: sessionToken.current || undefined, commandId: crypto.randomUUID(),
        name: displayName, gameId, settings: gameSettings,
      }));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'WELCOME') {
        sessionToken.current = message.sessionToken;
        meRef.current = message.playerId;
        localStorage.setItem(PLAYER_KEY, message.playerId);
        setMe(message.playerId);
        setHostId(message.hostId);
      } else if (message.type === 'STATE') {
        if (versionRef.current > 0 && message.version > versionRef.current + 1) {
          setSyncing(true);
          ws.send(JSON.stringify({ type: 'RESYNC', roomCode: nextRoom, playerId: meRef.current, sessionToken: sessionToken.current, commandId: crypto.randomUUID() }));
        } else {
          setSyncing(false);
        }
        versionRef.current = message.version;
        setRoomGame(message.gameId);
        setState(message.state);
        setVersion(message.version);
        setHostId(message.hostId);
        setPresence(message.presence ?? []);
        if (pendingGuess.current) {
          pendingGuess.current = null;
          setGuessPending(false);
          setGuessResetKey((key) => key + 1);
        }
        setAnswering(false);
        setError('');
      } else {
        setAnswering(false);
        setError(message.message);
        if (message.message === 'STALE_STATE') {
          setSyncing(true);
          ws.send(JSON.stringify({ type: 'RESYNC', roomCode: nextRoom, playerId: meRef.current, sessionToken: sessionToken.current, commandId: crypto.randomUUID() }));
        }
      }
    };
    ws.onerror = () => setError('Could not reach the table server. Is the realtime server running?');
    ws.onclose = () => {
      setConnected(false);
      if (screenRef.current === 'room' && reconnectAttempt.current < 5) {
        const delay = Math.min(8000, 500 * Math.pow(2, reconnectAttempt.current++));
        reconnectTimer.current = setTimeout(() => connect(nextRoom, displayName, gameId, gameSettings), delay);
      }
    };
  };

  useEffect(() => () => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    socket.current?.close();
  }, []);

  const send = (payload: Record<string, unknown>) => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      setError('You are disconnected from the table.');
      return;
    }
    socket.current.send(JSON.stringify({
      ...payload,
      roomCode: room,
      playerId: meRef.current,
      sessionToken: sessionToken.current,
      commandId: crypto.randomUUID(),
      lastVersion: versionRef.current,
    }));
  };

  const enter = (nextCode: string) => {
    const cleanName = name.trim().slice(0, 24);
    const nextRoom = nextCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    if (!cleanName) {
      setError('Add your name so friends can recognize you at the table.');
      return;
    }
    if (!nextRoom) {
      setError('Enter a room code first.');
      return;
    }
    const normalized = normalizeSettings(selectedGame, settings);
    setRoom(nextRoom);
    setRoomGame(selectedGame);
    screenRef.current = 'room';
    setScreen('room');
    connect(nextRoom, cleanName, selectedGame, normalized);
  };

  const leave = () => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectAttempt.current = 99;
    screenRef.current = 'lobby';
    sessionToken.current = '';
    localStorage.removeItem(PLAYER_KEY);
    const freshId = crypto.randomUUID();
    localStorage.setItem(PLAYER_KEY, freshId);
    meRef.current = freshId;
    setMe(freshId);
    socket.current?.close();
    setState(null);
    setRoomGame('cardfall');
    setScreen('lobby');
    setRoom('');
    setError('');
  };

  const cardfallState = roomGame === 'cardfall' ? state as CardfallState | null : null;
  const runtimeState = roomGame !== 'cardfall' ? state as RuntimeState | null : null;
  const active = cardfallState ? cardfallState.players[cardfallState.turn] : undefined;
  const local = cardfallState?.players.find((player) => player.id === me);
  const opponents = cardfallState?.players.filter((player) => player.id !== me) ?? [];
  const chooseTarget = target || opponents.find((player) => player.hand.length)?.id || '';
  const answer = (yes: boolean) => {
    if (answering) return;
    setAnswering(true);
    send({ type: 'ANSWER', yes });
  };
  const sendChat = () => {
    const text = chatDraft.trim();
    if (!text) return;
    send({ type: 'CHAT', message: text });
    setChatDraft('');
  };

  useEffect(() => {
    if (roomGame !== 'cardfall' || !room || !me) return;
    setNotebookNotes(loadNotebook(room, me));
  }, [roomGame, room, me]);

  useEffect(() => {
    if (roomGame !== 'cardfall' || !room || !me) return;
    saveNotebook(room, me, notebookNotes);
  }, [roomGame, room, me, notebookNotes]);

  useEffect(() => {
    if (roomGame !== 'cardfall' || !cardfallState || !me) return;
    setNotebookNotes((notes) => {
      const players = cardfallState.players;
      return cardfallState.events.reduce((current, event) => {
        const withQuestion = addQuestionNote(current, event, me, players.find((player) => player.id === event.targetId)?.name);
        return setAnswer(withQuestion, event, me);
      }, notes);
    });
  }, [roomGame, cardfallState, me]);

  useEffect(() => {
    if (roomGame !== 'cardfall' || !cardfallState || !me) return;
    const player = cardfallState.players.find((p) => p.id === me);
    if (player) setReady(player.ready ?? false);
  }, [roomGame, cardfallState, me]);

  const toggleNotebookNote = (noteId: string) => setNotebookNotes((notes) => toggleNote(notes, noteId));
  const updateNotebookAnnotation = (noteId: string, annotation: string) => setNotebookNotes((notes) => updateAnnotation(notes, noteId, annotation));
  const clearNotebookNotes = () => setNotebookNotes(clearNotebook());
  const toggleReady = () => {
    const next = !ready;
    setReady(next);
    send({ type: 'READY', ready: next });
  };
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable; select the code as fallback
      const codeEl = document.querySelector('.invite-code');
      if (codeEl) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  };

  if (screen === 'lobby') return (
    <div className="shell lobby-shell">
      <header className="topbar"><div className="brand"><span className="mark">✦</span><span>Card Table <b>Arena</b></span></div><span className="safe-pill">GUEST PLAY · NO ACCOUNT · PLAY MONEY</span></header>
      <main className="lobby lobby-wide"><div className="lobby-copy"><p className="eyebrow">CHOOSE YOUR TABLE</p><h1>Pick a game.<br /><em>Make it yours.</em></h1><p className="sub">Choose a classic, tune the table, then invite your friends.<br />You can play as a guest—no account required.</p><div className="steps"><span className="active">01 Choose</span><span>02 Tune</span><span>03 Invite</span></div></div>
        <div className="setup-panel"><div className="game-grid">{GAME_CATALOG.map((game) => <button key={game.id} className={`game-tile ${selectedGame === game.id ? 'chosen' : ''} accent-${game.accent}`} onClick={() => { setSelectedGame(game.id); setSettings(defaultSettings(game.id)); }}><span className="game-symbol">{game.id === 'cardfall' ? '✦' : game.id === 'blackjack' ? '♠' : game.id === 'holdem' ? '♣' : game.id === 'solitaire' ? '◈' : '◆'}</span><strong>{game.name}</strong><small>{game.tagline}</small><em>{game.players}</em></button>)}</div>
          <div className="selected-summary"><div><span className="panel-kicker">SELECTED GAME</span><h2>{selectedDefinition.name}<small>{selectedDefinition.tagline}</small></h2></div><span className="mode-pill">{selectedDefinition.players}</span></div>
          <div className="rules-settings"><div className="rules"><span className="panel-kicker">HOW IT WORKS</span>{selectedDefinition.rules.map((rule, index) => <p key={rule}><b>{index + 1}</b>{rule}</p>)}</div><div className="settings"><span className="panel-kicker">TABLE SETTINGS</span>{selectedDefinition.fields.map((field) => <label className="setting-field" key={field.key}>{field.label}{field.type === 'number' ? <input type="number" min={field.min} max={field.max} value={Number(settings[field.key])} onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })} /> : <select value={String(settings[field.key])} onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}>{field.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>}<small>{field.help}</small></label>)}</div></div>
          <label className="field-label">Your table name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" maxLength={24} /></label><div className="lobby-actions"><button className="primary" onClick={() => enter(roomCode())}>Create {selectedDefinition.name} table <span>→</span></button><div className="join-line"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="HAVE A ROOM CODE?" maxLength={12} /><button className="secondary" onClick={() => enter(code)}>Join table</button></div></div>{error && <p className="form-error">{error}</p>}<p className="guest-note">✦ You are joining as a guest. Your name is only used at this table.</p>
        </div>
      </main><footer><span>PRIVATE ROOMS · NO TRACKING</span><span>{GAME_CATALOG.length} TABLE MODES <i /> CARD TABLE ARENA</span></footer>
    </div>
  );

  if (roomGame !== 'cardfall') {
    const definition = gameById(roomGame);
    const runtimePlayers = runtimeState?.players ?? [];
    const runtimeLocal = runtimePlayers.find((player) => player.id === me);
    const isHost = hostId === me;
    const isLobby = runtimeState?.phase === 'lobby';
    const runtimeActive = runtimeState?.players[runtimeState.turn];
    const runtimeAction = roomGame === 'blackjack' ? 'HIT' : roomGame === 'solitaire' ? 'DRAW' : roomGame === 'highcard' ? 'REVEAL' : 'CHECK';
    const isBetStage = !isLobby && runtimeState?.phase === 'playing' && (roomGame === 'blackjack' || roomGame === 'holdem') && runtimeActive?.id === me
      && ((roomGame === 'blackjack' && !runtimeState?.bets?.[me]) || (roomGame === 'holdem' && !(runtimeState?.pot?.some(p => p.playerId === me))));
    const betAmount = (roomGame === 'holdem' ? runtimeState?.pot?.find(p=>p.playerId===me)?.amount : runtimeState?.bets?.[me]) ?? 0;
    const betChips = roomGame === 'holdem' ? runtimePlayers.find(p=>p.id===me)?.chips ?? 0 : runtimePlayers.find(p=>p.id===me)?.chips ?? 0;
    const placeBet = (amount: number) => {
      if (amount < 1 || amount > betChips) return;
      send({ type: 'BET', amount });
    };
    const actionLabel = roomGame === 'blackjack' ? 'Hit' : roomGame === 'solitaire' ? 'Draw' : roomGame === 'highcard' ? 'Reveal card' : 'Check';
    return <div className="shell"><header className="topbar"><div className="brand"><button className="back-button" onClick={leave}>←</button><span className="mark">✦</span><span>Card Table <b>Arena</b></span></div><div className="mode"><span className={`live-dot ${connected ? 'online' : ''}`} /><span className="sync-label">{syncing ? 'SYNCING' : 'LIVE'}</span><span className="divider" /> {definition.name.toUpperCase()} <span className="divider" /> ROOM <strong>{room}</strong></div><button className="ghost" onClick={() => setRulesOpen(true)}>Rules <span>?</span></button></header>
      <main className="room-shell"><div className="room-heading"><div><p className="eyebrow">{definition.name.toUpperCase()} · PLAY ROOM</p><h1><em>{definition.name}</em></h1><p className="sub">{runtimeState?.phase === 'playing' ? `Version ${version}. ${runtimeActive?.name ?? 'The table'} is up.` : 'Invite your friends, then start when the table is ready.'}</p></div><div className={`connection-card ${connected ? 'connected' : ''}`}><span className="connection-pulse" /><div><b>{connected ? 'Table connected' : 'Table offline'}</b><small>{connected ? `${runtimePlayers.length} players · Version ${version}` : 'Reconnecting automatically'}</small></div></div></div>
        <section className="runtime-board"><div className="runtime-board-head"><div><span className="panel-kicker">{definition.name.toUpperCase()}</span><h2>{isLobby ? 'Waiting room' : runtimeState?.phase === 'finished' ? 'Round complete' : 'Your table'}</h2></div><span className="mode-pill">{definition.players}</span></div><div className="runtime-players">{runtimePlayers.map((player, index) => <div className={`runtime-player ${runtimeActive?.id === player.id ? 'current' : ''}`} key={player.id}><span className="avatar">{player.name[0]?.toUpperCase()}</span><div><strong>{player.name}{player.id === me ? ' (you)' : ''}</strong><small>{player.hand.length ? `${player.hand.length} private cards` : isLobby ? 'ready' : 'in play'}</small></div><span className="runtime-seat-number">{runtimeActive?.id === player.id ? 'NOW' : String(index + 1).padStart(2, '0')}</span></div>)}</div>{roomGame === 'blackjack' && <div className="runtime-zone dealer-zone"><span className="panel-kicker">DEALER</span><div className="runtime-cards">{runtimeState?.dealer?.hand.map((card) => <span className="runtime-card" key={card.id}>{displayCard(card)}</span>)}</div><small>{runtimeState?.dealer?.revealed ? 'Dealer hand revealed' : 'One dealer card stays hidden'}</small></div>}{roomGame === 'holdem' && <div className="runtime-zone"><span className="panel-kicker">COMMUNITY · {runtimeState?.street?.toUpperCase()}</span><div className="runtime-cards">{runtimeState?.community.map((card) => <span className="runtime-card" key={card.id}>{displayCard(card)}</span>)}</div></div>}{roomGame === 'solitaire' && <div className="runtime-zone solitaire-zone"><div><span className="panel-kicker">STOCK</span><div className="runtime-card">{runtimeState?.stock.length ?? 0} cards</div></div><div><span className="panel-kicker">WASTE</span><div className="runtime-card">{runtimeState?.waste.at(-1) ? displayCard(runtimeState.waste.at(-1)!) : 'Empty'}</div></div></div>}{roomGame === 'highcard' && <div className="runtime-zone"><span className="panel-kicker">REVEAL STATUS</span><p>{Object.keys(runtimeState?.revealedCards ?? {}).length} of {runtimePlayers.length} players revealed</p></div>}<div className="runtime-private"><span className="panel-kicker">YOUR PRIVATE AREA</span><div className="runtime-cards">{runtimeLocal?.hand.map((card) => <span className="runtime-card" key={card.id}>{displayCard(card)}</span>)}{!runtimeLocal?.hand.length && <span className="runtime-empty">Your cards will appear here when the round starts.</span>}</div></div></section>
        <section className="below-table"><div className="controls"><div className="control-head"><div><p className="eyebrow">YOUR MOVE</p><h2>{isLobby ? 'Invite your table' : runtimeActive?.id === me ? 'You are up' : 'Watch the table'}</h2></div>{isLobby && isHost && <button className="primary" disabled={(roomGame === 'holdem' && runtimePlayers.length < 2)} onClick={() => send({ type: 'START_GAME' })}>Start {definition.name} <span>→</span></button>}{!isLobby && runtimeActive?.id === me && isBetStage && <BetPanel gameId={roomGame} chips={betChips} onBet={placeBet} />}{!isLobby && runtimeActive?.id === me && <button className="primary" onClick={() => send({ type: runtimeAction })}>{actionLabel} <span>→</span></button>}</div>{isLobby && <div className="waiting invite-box"><span className="invite-code">{room}</span><button className="secondary" onClick={() => navigator.clipboard?.writeText(room)}>Copy room code</button><p>Send this code to the people you want at the table.</p></div>}{!isLobby && runtimeState?.phase === 'playing' && <div className="waiting">{runtimeActive?.id === me ? `Your action: ${actionLabel}.` : `${runtimeActive?.name} is taking the turn.`}</div>}</div><aside className="activity-panel"><div className="activity-head"><div><p className="eyebrow">TABLE CHAT</p><h2>Activity</h2></div><span>{runtimeState?.events.length ?? 0} updates</span></div><div className="activity-feed">{runtimeState?.events.slice(-8).map((event) => <div className={`activity-line ${event.tone ?? ''}`} key={event.id}><span className="activity-dot" /><span>{event.text}</span></div>)}{!runtimeState?.events.length && <p className="activity-empty">Game events and messages will appear here for everyone.</p>}</div><div className="chat-compose"><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendChat(); }} placeholder="Send a message to the table…" maxLength={300} /><button disabled={!chatDraft.trim() || !connected} onClick={sendChat}>Send</button></div></aside></section>{error && <div className="form-error inline-error">{error}</div>}</main><footer><span>PLAY MONEY · JUST FOR FUN</span><span>{connected ? 'CONNECTED' : 'OFFLINE'} <i /> {definition.name}</span></footer><RulesDialog open={rulesOpen} gameName={definition.name} rules={definition.rules} onClose={() => setRulesOpen(false)} /></div>;
  }

  const cardfallActive = cardfallState?.players[cardfallState.turn];
  const cardfallLocal = cardfallState?.players.find((player) => player.id === me);
  const cardfallOpponents = cardfallState?.players.filter((player) => player.id !== me) ?? [];
  const cardfallTarget = target || cardfallOpponents.find((player) => player.hand.length)?.id || '';
  const play = (payload: Record<string, unknown>) => send(payload);
  const confirmGuess = (targetId: string, cardId: string) => {
    if (pendingGuess.current) return;
    pendingGuess.current = { targetId, cardId };
    setGuessPending(true);
    play({ type: 'GUESS', targetId, cardId });
  };

  return <div className="shell"><header className="topbar"><div className="brand"><button className="back-button" onClick={leave}>←</button><span className="mark">✦</span><span>Card Table <b>Arena</b></span></div><div className="mode"><span className={`live-dot ${connected ? 'online' : ''}`} /><span className="sync-label">{syncing ? 'SYNCING' : 'LIVE'}</span><span className="divider" /> CARD<span className="muted">FALL</span><span className="divider" /> ROOM <strong>{room}</strong></div><button className="ghost" onClick={() => setRulesOpen(true)}>Rules <span>?</span></button></header>
    <main className="room-shell"><div className="room-heading"><div><p className="eyebrow">CARD FALL · ROUND {cardfallState?.phase === 'playing' || cardfallState?.phase === 'finished' ? '01' : '—'}</p><h1>{cardfallState?.phase === 'playing' && cardfallActive ? <><em>{cardfallActive.name}</em> is playing</> : cardfallState?.phase === 'finished' ? 'Table complete' : 'Waiting for the table'}</h1><p className="sub">{cardfallState?.phase === 'playing' && cardfallActive?.id === me ? 'Your turn: make a question or guess an exact card.' : cardfallState?.phase === 'playing' ? `Watch ${cardfallActive?.name} make a move. The table will update live.` : 'Share the room code, then deal when everyone is ready.'}</p></div><div className={`connection-card ${connected ? 'connected' : ''}`}><span className="connection-pulse" /><div><b>{connected ? syncing ? 'Resyncing table' : 'Table connected' : 'Table offline'}</b><small>{connected ? `Version ${version} · ${cardfallState?.players.length ?? 0} players` : 'Reconnecting automatically'}</small></div></div></div>
      <section className="turn-rail"><div className="turn-rail-label"><span>TURN ORDER</span><b>{cardfallState?.phase === 'playing' && cardfallActive ? `${cardfallActive.name.toUpperCase()}'S TURN NOW` : 'TABLE SETUP'}</b></div><div className="turn-track">{cardfallState?.players.map((player, index) => <div className={`turn-player ${player.id === cardfallActive?.id ? 'current' : ''} ${player.id === me ? 'self' : ''}`} key={player.id}><div className="turn-number">{player.id === cardfallActive?.id ? 'NOW' : String(index + 1).padStart(2, '0')}</div><span className="avatar">{player.name[0]?.toUpperCase()}</span><div><strong>{player.name}{player.id === me ? ' (you)' : ''}</strong><small>{player.hand.length ? `${player.hand.length} cards remaining` : cardfallState.phase === 'lobby' ? 'ready' : 'out'}</small>{presence.includes(player.id) ? <span className="presence-dot online" aria-label="Online" /> : <span className="presence-dot offline" aria-label="Offline" />}{player.id === hostId && <span className="host-badge">HOST</span>}</div>{player.id === cardfallActive?.id && <span className="turn-chevron">→</span>}</div>)}</div></section>
      <section className="felt"><div className="felt-glow" /><div className="table-label"><span>TABLE CENTER</span><span className="turn-label">{cardfallState?.phase === 'playing' && cardfallActive ? `NOW PLAYING · ${cardfallActive.name.toUpperCase()}` : 'WAITING FOR DEAL'}</span></div>{cardfallOpponents.map((player, index) => <div className={`seat seat-${(index % 2) + 1}`} key={player.id}><div className="seat-head"><span className="avatar">{player.name[0]?.toUpperCase()}</span><div><b>{player.name}</b><small>{player.hand.length ? `${player.hand.length} cards hidden` : cardfallState?.phase === 'lobby' ? 'READY' : 'TOPPLED'}</small></div>{cardfallActive?.id === player.id && cardfallState?.phase === 'playing' && <span className="your-turn">PLAYING NOW</span>}</div><div className="back-row">{Array.from({ length: Math.min(player.hand.length || 5, 5) }).map((_, index) => <div className="mini-back" key={index}>✦</div>)}</div></div>)}<div className="center-stack"><div className="table-ring" /><div className="table-shadow" /><ToppledPool cards={cardfallState?.toppledCards ?? []} /><div className="discard"><span>✦</span><small>RESOLVED<br />CARDS</small></div></div><ToppleAnimation lastTopple={cardfallState?.lastTopple} cards={cardfallState?.toppledCards ?? []} /><div className="my-seat"><div className="my-head"><div className="avatar you">{cardfallLocal?.name[0]?.toUpperCase() || 'Y'}</div><div><b>{cardfallLocal?.name || name || 'You'}</b><small>{cardfallLocal?.hand.length ? `${cardfallLocal.hand.length} cards in hand` : 'Waiting for deal'}</small></div><span className="score">{cardfallLocal?.correctGuesses || 0} <small>TOPPLES</small></span></div><div className="hand">{cardfallLocal?.hand.length ? cardfallLocal.hand.map((card) => <div className="playing-card" key={card.id}><small>{card.rank}</small><strong className={card.suit === '♥' || card.suit === '♦' ? 'red' : ''}>{card.suit}</strong></div>) : <div className="empty-hand">Your private hand appears here after the host deals.</div>}</div></div></section>
      <section className="below-table"><div className="controls"><div className="control-head"><div><p className="eyebrow">YOUR MOVE</p><h2>{!cardfallState || cardfallState.phase === 'lobby' ? 'Invite your table' : cardfallState.phase === 'finished' ? 'The table has spoken' : cardfallActive?.id === me ? 'You are up' : 'Watch the table'}</h2></div>{cardfallState?.phase === 'lobby' && hostId === me && <button className="primary" disabled={cardfallState.players.length < 2} onClick={() => send({ type: 'START_GAME' })}>{cardfallState.players.length < 2 ? 'Need one more player' : 'Deal the cards'} <span>→</span></button>}{cardfallState?.phase === 'lobby' && hostId !== me && <span className="waiting host-note">Waiting for the host to deal</span>}{cardfallState?.phase === 'finished' && <div className="finish-summary"><div><span className="panel-kicker">FINAL RESULT</span><h2>{cardfallState.events.find((e) => e.kind === 'win')?.text ?? 'Table complete'}</h2></div><div className="finish-stats"><div><strong>{cardfallState.toppledCards.length}</strong><small>CARDS TOPPLED</small></div><div><strong>{cardfallState.players.filter((p) => p.hand.length).length}</strong><small>PLAYERS STANDING</small></div><div><strong>{cardfallState.players.reduce((sum, p) => sum + p.correctGuesses, 0)}</strong><small>TOTAL TOPPLES</small></div></div><button className="secondary" onClick={leave}>Leave table</button></div>}{cardfallState?.phase === 'playing' && cardfallActive?.id === me && <div className="tabs"><button className={tab === 'ask' ? 'selected' : ''} onClick={() => setTab('ask')}>Ask a question</button><button className={tab === 'guess' ? 'selected' : ''} onClick={() => setTab('guess')}>Guess a card</button></div>}</div>{cardfallState?.phase === 'lobby' && <div className="waiting invite-box"><span className="invite-code">{room}</span><button className="secondary" onClick={copyRoomCode}>{copied ? 'Copied!' : 'Copy room code'}</button><p>Send this code to the people you want at the table.</p></div>}{cardfallState?.phase === 'lobby' && <div className="ready-row"><button className={`ready-toggle ${ready ? 'ready' : ''}`} type="button" onClick={toggleReady}>{ready ? 'Ready' : 'Mark ready'}</button></div>}{cardfallState?.phase === 'playing' && cardfallState.pendingQuestion?.targetId === me && <div className="answer-panel"><p><b>{cardfallState.players.find((player) => player.id === cardfallState.pendingQuestion?.askerId)?.name}</b> asks: “{cardfallState.pendingQuestion.question}”</p><div><button className="yes-button" disabled={answering} onClick={() => answer(true)}>Yes</button><button className="no-button" disabled={answering} onClick={() => answer(false)}>No</button></div></div>}{cardfallState?.phase === 'playing' && cardfallActive?.id === me && !cardfallState.pendingQuestion && <div className="action-panel">{tab === 'ask' ? <><label>Ask <select value={cardfallTarget} onChange={(event) => setTarget(event.target.value)}>{cardfallOpponents.filter((player) => player.hand.length).map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select> something about their hand</label><div className="input-row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Do you have a red card?" /><button disabled={!question.trim() || !cardfallTarget} onClick={() => play({ type: 'ASK', targetId: cardfallTarget, question })}>Ask <span>↗</span></button></div><p className="hint">They can only answer <b>YES</b> or <b>NO</b>. Everyone at the table sees the question.</p></> : <><CardPicker
   resetKey={guessResetKey}
   targets={cardfallOpponents.filter((player) => player.hand.length).map((player) => ({ id: player.id, name: player.name, handCount: player.hand.length }))}
   targetId={cardfallTarget}
   onTargetChange={setTarget}
   onConfirm={confirmGuess}
   disabled={guessPending}
 /><p className="hint">Correct guesses topple a card and send it to the resolved pile.</p></>}</div>}{cardfallState?.phase === 'playing' && cardfallActive?.id !== me && <div className="waiting">{cardfallActive?.name} is thinking. The table will update when they make a move.</div>}</div><aside className="activity-panel"><div className="activity-head"><div><p className="eyebrow">TABLE CHAT</p><h2>Activity</h2></div><span>{cardfallState?.events.length || 0} updates</span></div><ActivityFeed events={cardfallState?.events ?? []} /><div className="chat-compose"><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendChat(); }} placeholder="Send a message to the table…" maxLength={300} /><button disabled={!chatDraft.trim() || !connected} onClick={sendChat}>Send</button></div></aside><div className="notebook-launcher"><button className="secondary" type="button" onClick={() => setNotebookOpen(true)}>Open deduction notebook</button><small>{notebookNotes.length} private {notebookNotes.length === 1 ? 'note' : 'notes'}</small></div><NotebookPanel open={notebookOpen} notes={notebookNotes} players={cardfallState?.players ?? []} onClose={() => setNotebookOpen(false)} onToggle={toggleNotebookNote} onAnnotationChange={updateNotebookAnnotation} onClear={clearNotebookNotes} /></section>{error && <div className="form-error inline-error">{error}</div>}</main><footer><span>PLAY MONEY · JUST FOR FUN</span><span>{connected ? 'CONNECTED' : 'OFFLINE'} <i /> Cardfall</span></footer><RulesDialog open={rulesOpen} gameName="Cardfall" rules={['Ask a player about their hidden cards, or guess an exact card.', 'Correct guesses topple a card and send it to the resolved pile.', 'The table rotates turns after each question, answer, or guess.']} onClose={() => setRulesOpen(false)} /></div>;
}

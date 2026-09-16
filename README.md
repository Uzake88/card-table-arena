# Card Table Arena

A tabletop-style browser prototype for social, play-money card games. The current release includes a polished **Cardfall** table experience and pure, deterministic engines for Cardfall, Blackjack, Texas Hold'em, High Card Duel, and Solitaire.

## Run it

```bash
npm install
npm run dev          # frontend on http://localhost:3000
npm run realtime     # WebSocket server on ws://localhost:8787
```

Open http://localhost:3000. Create a table, share the room code, and play.

## Architecture

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind-free custom CSS.
- **Realtime server:** Node WebSocket server (`server/index.ts`) with authoritative state, per-player projections, and JSON file persistence.
- **Engines:** Pure, deterministic game reducers in `lib/games/`.
- **Protocol:** Zod-validated commands with session tokens, canonical player IDs, room binding, state versions, and command dedupe.

## Features

- **Cardfall:** Tactile rank/suit card picker, topple animation with public pool, scrollable activity feed, private deduction notebook, accessible rules dialog, presence/readiness, host continuity, safe rejoin, finish summary.
- **Blackjack:** Hit/stand with dealer reveal, dealer soft-17 rule, bet panel with chip management.
- **Texas Hold'em:** Private hole cards, community streets (preflop/flop/turn/river/showdown), check progression, bet panel with pot accumulation.
- **High Card Duel:** Hidden cards, simultaneous reveal, winner determination.
- **Solitaire:** Klondike draw-1/draw-3, stock/waste management.

## Verified

- `npm test -- --run` — 52 Vitest tests pass across 13 files
- `npm run typecheck` — passes
- `npm run build` — passes
- `npm run test:e2e` — 14 Playwright tests pass
- Production: Vercel frontend + Render WebSocket server

## Persistence

Rooms and sessions are persisted to `data/rooms.json` and restored on server restart. Active in-flight games survive restarts; connected clients are disconnected and must rejoin.

## Limitations

- **No real-money wagering.** Play money only.
- **Single-instance WebSocket server.** Not horizontally scalable.
- **No account system.** Players are identified by server-issued session tokens stored in localStorage.
- **No durable command log.** Commands are deduped in-memory only; room/state/events are persisted to JSON.
- **Blackjack/Hold'em betting is functional but simplified.** No fold/raise mechanics; bets are placed before the round starts.

## License

MIT

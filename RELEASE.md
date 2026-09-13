# Card Table Arena — release notes

## Current release

This release contains:

- Cardfall, the custom hidden-card guessing game
- Tested Blackjack engine
- Tested Texas Hold'em dealing/street engine
- Tested High Card Duel engine
- Server-authoritative Cardfall WebSocket rooms
- Canonical server-issued player identities
- Session-token reconnects and resync
- Cross-room socket isolation
- Request validation with Zod
- Per-player private projections
- Responsive tabletop interface with perspective/depth styling

## Local run

```bash
npm ci
npm run dev
npm run realtime
```

Open `http://localhost:3000`. The realtime service listens on `8787`.

## Docker run

```bash
docker compose up --build
```

## Free deployment

The included `render.yaml` deploys two free services: a web service and a realtime service. The web service exposes `/api/config`, which supplies the realtime service URL at runtime. Set `NEXT_PUBLIC_REALTIME_URL` on the web service to the public `wss://` URL of the realtime service.

The current realtime service keeps room state in memory. Use one service instance for this release. Before horizontal scaling or guaranteed recovery across restarts, replace the in-memory room actor with a durable transactional store and a shared event/broadcast layer.

## Product safety

This is a play-money social game. It has no wagering, cash-out, purchase, or real-money mechanics.

## Release verification

```bash
npm test -- --run
npm run typecheck
npm run build
docker compose config
```

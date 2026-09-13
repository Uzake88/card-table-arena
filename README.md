# Card Table Arena

A tabletop-style browser prototype for social, play-money card games. The current release includes a polished **Cardfall** table experience and pure, deterministic engines for Cardfall, Blackjack, Texas Hold’em, and High Card Duel.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Deal the cards**, then use the question/guess controls. The current first slice is deliberately server-independent so the rules can be tested and played immediately in one browser.

## Verified

- `npm test -- --run` — Cardfall reducer tests pass
- `npm run typecheck` — passes
- `npm run build` — passes

## Next production step: shared online rooms

The UI and rule engines are ready to be connected to a shared authoritative backend. Set up a Supabase project, apply the SQL migration described in the implementation plan, then move the reducer behind the room action route and publish ordered events through Supabase Realtime. Do not expose the full game state to clients: return a private projection for each player.

No gambling or real-money wagering is included. This is a play-money social game.

# Cardfall Interaction, Information Design, and Turn UX Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace Cardfall’s dropdown-heavy action surface with a tactile card picker, explicit question/guess modes, visible turn rotation, animated toppled cards, a browsable public toppled-card pool, scrollable activity history, and a private per-player deduction notebook without weakening server authority or hidden-card privacy.

**Architecture:** Keep the Node/WebSocket server authoritative for turns, questions, answers, guesses, card movement, rankings, versions, and public projections. Extend the pure Cardfall reducer with structured events and a public `toppledCards` collection; keep the notebook as browser-local private state. Build the room as an **Operate + Monitor** surface: the current turn and next action dominate, while the felt table, toppled pool, activity stream, and notebook support inspection without competing with the primary action.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node `ws`, Zod, Vitest, Playwright/Chromium, CSS keyframes with `prefers-reduced-motion` support, native `<dialog>` for accessible overlays, `localStorage` for the private notebook.

---

## Current context and assumptions

- Project: `/Users/justingabrielsy/card-table-arena`
- Existing production architecture: Vercel Next.js frontend plus Render Node WebSocket server.
- Existing Cardfall reducer: `lib/games/cardfall/engine.ts`.
- Existing Cardfall projection: `lib/games/cardfall/projection.ts`.
- Existing realtime server: `server/index.ts`.
- Existing client room/lobby: `components/TableView.tsx`.
- Existing styling: `app/globals.css`.
- Existing tests: Vitest under `lib/**/*.test.ts` and Playwright under `tests/e2e/`.
- Existing protocol uses command IDs, session tokens, canonical server player IDs, room binding, state versions, and per-recipient projections.
- A correct guess is allowed to reveal the toppled card publicly because the user explicitly wants a visible toppled-card pool; the server should still never reveal an unguessed opponent card.
- Notebook entries are private browser-local annotations. They are not authoritative game state and must never be sent to the server unless the user explicitly asks for shared notes in a future feature.
- The existing catalog advertises Blackjack, Solitaire, High Card Duel, and Hold’em. This plan improves Cardfall’s interaction surface and its shared room contracts; it must not describe partially implemented secondary adapters as full casino/poker rules until their own rules are complete.

## Design direction and research-derived patterns

Use general patterns—not copied proprietary UI—from the reviewed open-source projects:

- VirtualTabletop: room-first no-account entry, shared synchronized surface, private hands, discoverable game library.
- Cockatrice/Phase: authoritative server, per-player projections, explicit zones, hidden-information boundaries.
- Open-source multiplayer Blackjack examples: dedicated action buttons, chat/activity, responsive table, dealing/result feedback.
- Existing Card Table Arena visual language: editorial serif headings, dark green felt, gold emphasis, mono metadata.

Anti-slop constraints:

- The room is not a marketing hero. It is an Operate/Monitor surface.
- Do not add decorative statistic cards, arbitrary scores, or a feature-tile grid inside the game room.
- Use the felt table only for cards/seats/pool; put controls and investigation tools in clear panels below or beside it.
- Use one primary action accent (gold), one table accent (green), and semantic success/danger colors.
- Every animation must explain a state change; no perpetual decorative motion.
- Every dynamic state change must have a visual treatment and an accessible text/status equivalent.

---

## Task 1: Define structured Cardfall events and public toppled-card state

**Objective:** Give the reducer and client reliable data for animation, activity filtering, and notebook synchronization instead of parsing display strings.

**Files:**
- Modify: `lib/games/cardfall/engine.ts`
- Create: `lib/games/cardfall/events.ts`
- Test: `lib/games/cardfall/engine.test.ts`
- Test: `tests/projection.test.ts`

**Step 1: Write failing tests**

Add tests for:

```ts
it('adds a correctly guessed card to the public toppled pile', () => {
  let state = reduce(initial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]), {
    type: 'START', seed: 1, cardsPerPlayer: 1,
  });
  const card = state.players[1].hand[0];
  state = reduce(state, { type: 'GUESS', actorId: 'a', targetId: 'b', cardId: card.id });
  expect(state.toppledCards).toContainEqual(card);
  expect(state.lastTopple?.cardId).toBe(card.id);
});

it('emits structured question and answer metadata', () => {
  let state = startedThreePlayerState();
  state = reduce(state, { type: 'ASK', actorId: 'a', targetId: 'b', question: 'Do you have a red card?' });
  const question = state.events.at(-1)!;
  expect(question.kind).toBe('question');
  expect(question.questionId).toBeTruthy();
  state = reduce(state, { type: 'ANSWER', actorId: 'b', yes: true });
  const answer = state.events.at(-1)!;
  expect(answer.kind).toBe('answer');
  expect(answer.questionId).toBe(question.questionId);
  expect(answer.answer).toBe(true);
});
```

Run:

```bash
npm test -- --run lib/games/cardfall/engine.test.ts
```

Expected: FAIL because `toppledCards`, `lastTopple`, and structured event fields do not yet exist.

**Step 2: Add the event contract**

Create `lib/games/cardfall/events.ts` with a discriminated shape:

```ts
export type CardfallEventKind =
  | 'deal'
  | 'question'
  | 'answer'
  | 'guess'
  | 'topple'
  | 'elimination'
  | 'win'
  | 'chat';

export type CardfallEvent = {
  id: string;
  kind: CardfallEventKind;
  text: string;
  tone?: string;
  actorId?: string;
  targetId?: string;
  questionId?: string;
  question?: string;
  answer?: boolean;
  cardId?: string;
};
```

Add `toppledCards: Card[]` and:

```ts
lastTopple?: {
  sequence: number;
  cardId: string;
  actorId: string;
  targetId: string;
};
```

to the authoritative `CardfallState`.

**Step 3: Implement the smallest reducer change**

- Initialize `toppledCards: []`.
- When a correct `GUESS` removes a card, append it to `toppledCards` and update `lastTopple.sequence`.
- Emit a `topple` event with the card ID, actor, target, and safe public text.
- Assign a `questionId` when `ASK` creates a pending question.
- Carry that ID into the structured `answer` event.
- Keep wrong guesses structured as `guess` with `cardId` omitted; never reveal an unguessed card.

**Step 4: Verify green**

```bash
npm test -- --run lib/games/cardfall/engine.test.ts tests/projection.test.ts
```

Expected: all targeted tests pass.

**Step 5: Commit**

```bash
git add lib/games/cardfall/engine.ts lib/games/cardfall/events.ts lib/games/cardfall/engine.test.ts tests/projection.test.ts
git commit -m "feat: add structured Cardfall events and toppled pile"
```

---

## Task 2: Preserve hidden-card privacy while exposing the toppled pile

**Objective:** Make the public toppled pile visible to everyone while keeping opponent hands and private removed-card metadata redacted.

**Files:**
- Modify: `lib/games/cardfall/projection.ts`
- Modify: `tests/projection.test.ts`
- Create: `lib/games/cardfall/projection.test.ts` if the existing projection test should be split

**Step 1: Write failing tests**

```ts
it('exposes only publicly toppled cards, not opponent private collections', () => {
  const state = stateAfterCorrectGuess();
  const projection = publicProjection(state, 'a');
  expect(projection.toppledCards[0].id).not.toBe('hidden');
  expect(projection.players.find(p => p.id === 'b')!.hand.every(c => c.id === 'hidden')).toBe(true);
  expect(projection.players.find(p => p.id === 'b')!.removed.every(c => c.id === 'hidden')).toBe(true);
});

it('does not expose an unguessed card through lastTopple or events', () => {
  const state = stateAfterWrongGuess();
  const serialized = JSON.stringify(publicProjection(state, 'a'));
  expect(serialized).not.toContain(unknownOpponentCardId);
  expect(state.lastTopple).toBeUndefined();
});
```

Run the targeted test and confirm RED.

**Step 2: Implement projection rules**

- Keep `toppledCards` as real public card identities because a correct guess already establishes that identity.
- Redact `players[].hand` for every non-viewer.
- Redact `players[].removed` for every non-viewer unless the card is represented in the public root `toppledCards` and the UI does not need the per-player private collection.
- Preserve structured event metadata only when it is public. Do not serialize hidden card IDs in wrong-guess events.
- Keep `lastTopple.cardId` public only for a successful topple.

**Step 3: Verify green**

```bash
npm test -- --run tests/projection.test.ts lib/games/cardfall/projection.test.ts
```

**Step 4: Commit**

```bash
git add lib/games/cardfall/projection.ts tests/projection.test.ts
 git commit -m "fix: harden Cardfall toppled-card projections"
```

---

## Task 3: Make turn rotation explicit and invariant-driven

**Objective:** Ensure every completed move produces exactly one next active player, while pending questions create a clearly defined answer sub-turn.

**Files:**
- Modify: `lib/games/cardfall/engine.ts`
- Modify: `lib/games/cardfall/engine.test.ts`
- Modify: `components/TableView.tsx` only after reducer tests pass

**Step 1: Add failing reducer tests**

Cover a three-player sequence:

```ts
it('rotates A -> B answer -> C after a question', () => {
  let state = startedThreePlayerState();
  expect(state.players[state.turn].id).toBe('a');
  state = reduce(state, { type: 'ASK', actorId: 'a', targetId: 'b', question: 'Red?' });
  expect(state.pendingQuestion?.targetId).toBe('b');
  expect(state.players[state.turn].id).toBe('b');
  state = reduce(state, { type: 'ANSWER', actorId: 'b', yes: false });
  expect(state.players[state.turn].id).toBe('c');
});

it('rotates after both wrong and correct guesses', () => {
  const wrong = stateAfterWrongGuess();
  expect(wrong.players[wrong.turn].id).toBe('b');
  const right = stateAfterCorrectGuess();
  expect(right.players[right.turn].id).toBe('b');
});

it('skips eliminated players and never gives them a turn', () => {
  const state = stateThatEliminatesB();
  expect(state.players[state.turn].id).not.toBe('b');
});
```

Run the targeted tests and confirm RED where the current semantics differ.

**Step 2: Implement explicit turn metadata**

Add derived or persisted fields:

```ts
turnNumber: number;
turnReason: 'move' | 'answer' | 'setup' | 'finished';
```

Increment `turnNumber` only when the active actor changes. Set `turnReason='answer'` while a target must answer and `turnReason='move'` after the answer resolves.

**Step 3: Verify and commit**

```bash
npm test -- --run lib/games/cardfall/engine.test.ts
npm run typecheck
 git add lib/games/cardfall/engine.ts lib/games/cardfall/engine.test.ts
 git commit -m "fix: make Cardfall turn rotation explicit"
```

---

## Task 4: Wire Cardfall settings honestly

**Objective:** Make cards-per-player and timer settings affect the authoritative room instead of being decorative controls.

**Files:**
- Modify: `server/index.ts`
- Modify: `lib/protocol.ts`
- Modify: `lib/games/cardfall/engine.ts`
- Modify: `components/TableView.tsx`
- Test: `lib/games/cardfall/engine.test.ts`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Write failing tests**

```ts
it('deals the configured cards-per-player value', () => {
  const state = startedStateWithCards(3);
  expect(state.players[0].hand).toHaveLength(3);
});

it('rejects an over-capacity configuration', () => {
  expect(() => reduce(initialEightPlayers(), { type: 'START', cardsPerPlayer: 7 })).toThrow(/Not enough cards/);
});
```

Add Playwright coverage that selects `3`, starts with two guests, and asserts each private hand contains three cards.

**Step 2: Implement settings propagation**

- Store normalized `cardsPerPlayer` in the room’s settings.
- Start Cardfall with `Number(room.settings.cardsPerPlayer ?? 5)`.
- Never hardcode `5` in the client action payload.
- Either implement the timer server-authoritatively or remove the timer field from the catalog. Recommended implementation:
  - Store `turnDeadline` in room state.
  - Schedule server-side timeout/pass behavior when the timer is enabled.
  - Broadcast remaining deadline as display metadata only.
  - Never let the client decide that a turn expired.

**Step 3: Verify**

```bash
npm test -- --run lib/games/cardfall/engine.test.ts
npm run test:e2e -- --grep "cards per player"
```

**Step 4: Commit**

```bash
git add server/index.ts lib/protocol.ts lib/games/cardfall/engine.ts components/TableView.tsx lib/games/cardfall/engine.test.ts tests/e2e/cardfall.spec.ts
 git commit -m "fix: honor Cardfall table settings"
```

---

## Task 5: Replace the guess dropdown with a tactile card picker

**Objective:** Let players choose a target card by tapping rank/suit controls and explicitly confirming, with no native card dropdown.

**Files:**
- Create: `components/cardfall/CardPicker.tsx`
- Create: `lib/cards/card-picker.ts`
- Create: `lib/cards/card-picker.test.ts`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Write failing pure picker tests**

```ts
it('returns the exact selected card ID from rank and suit', () => {
  expect(cardIdForSelection('A', '♦')).toBe('A♦');
});

it('lists all 52 unique selectable cards', () => {
  expect(allCardOptions()).toHaveLength(52);
  expect(new Set(allCardOptions().map(card => card.id)).size).toBe(52);
});
```

Run:

```bash
npm test -- --run lib/cards/card-picker.test.ts
```

Expected: RED until the picker model exists.

**Step 2: Implement the picker model**

`lib/cards/card-picker.ts` should expose:

```ts
export function cardIdForSelection(rank: Rank, suit: Suit) {
  return `${rank}${suit}`;
}

export function allCardOptions() {
  return createDeck();
}
```

**Step 3: Implement the UI**

`CardPicker` requirements:

- A rank strip: `A, 2, 3, ..., 10, J, Q, K`.
- Suit icon buttons: `♠`, `♥`, `♦`, `♣`, each with an accessible name such as `Select diamonds`.
- A 4×13 card matrix or responsive card grid; no `<select>` for card selection.
- Selected card has visible border, elevation, and `aria-pressed="true"`.
- Confirm button is disabled until a card is selected.
- Confirm sends `{ type: 'GUESS', targetId, cardId }` and closes/resets the picker only after the server accepts the command.
- The target player is selected with accessible player chips, not a native dropdown.
- The UI displays a compact preview: `Guessing: A♦ in Guest’s hand`.
- Support keyboard activation with Enter/Space and minimum 44px touch targets.

**Step 4: Add browser acceptance coverage**

```ts
await page.getByRole('button', { name: 'Guess a card' }).click();
await page.getByRole('button', { name: 'Select diamonds' }).click();
await page.getByRole('button', { name: 'A of diamonds' }).click();
await expect(page.getByText('Guessing: A♦')).toBeVisible();
await page.getByRole('button', { name: 'Confirm guess' }).click();
await expect(page.locator('select')).toHaveCount(0);
```

**Step 5: Commit**

```bash
git add components/cardfall/CardPicker.tsx lib/cards/card-picker.ts lib/cards/card-picker.test.ts components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "feat: add tactile Cardfall card picker"
```

---

## Task 6: Animate successful topples and build the public toppled-card pool

**Objective:** Make a successful guess visually move a card from the target’s area into a clickable resolved-card pool.

**Files:**
- Create: `components/cardfall/ToppledPool.tsx`
- Create: `components/cardfall/ToppleAnimation.tsx`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Add a failing browser test**

- Start a deterministic Cardfall table with two players.
- Use the picker to select the known target card from a test-friendly seeded flow or drive the protocol directly, then return to the UI.
- Assert the toppled pool count increments.
- Assert a visible animation/status element appears.
- Click the pool and assert a dialog with the toppled card is visible.

**Step 2: Implement the pool**

`ToppledPool` should:

- Show `TOPPLED PILE · N` in the table center.
- Render compact card backs/face-up cards using `toppledCards`.
- Be a real button with accessible name `Open toppled cards`.
- Open a native dialog with all toppled cards, rank/suit labels, and close button.
- Preserve the pool after refresh through server state, not local-only state.

**Step 3: Implement animation**

- Watch `lastTopple.sequence` with `useEffect`.
- Render a temporary `ToppleAnimation` overlay containing the public toppled card.
- Animate target-to-pool with `transform`, opacity, and a short gold impact pulse.
- Use `aria-live="polite"` to announce `${card} was toppled from ${target}`.
- Add:

```css
@media (prefers-reduced-motion: reduce) {
  .topple-flight,
  .topple-impact {
    animation: none;
  }
}
```

- Do not animate wrong guesses as if a card fell; show a distinct `No card toppled` event.

**Step 4: Verify and commit**

```bash
npm run test:e2e -- --grep "toppled"
npm run typecheck
 git add components/cardfall/ToppledPool.tsx components/cardfall/ToppleAnimation.tsx components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "feat: animate and inspect toppled Cardfall cards"
```

---

## Task 7: Make the activity stream a real scrollable conversation

**Objective:** Let players inspect the full question/answer/guess/chat history instead of seeing only the last few truncated events.

**Files:**
- Create: `components/cardfall/ActivityFeed.tsx`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Write a failing browser test**

Generate more than eight events through chat and question/answer actions. Assert:

- All events remain in the DOM or are reachable through deterministic paging.
- The feed has `overflow-y: auto`.
- The latest event is visible.
- A `New activity` indicator appears when the user has scrolled away from the bottom.

**Step 2: Implement `ActivityFeed`**

- Render structured events, not text parsing.
- Keep the full server-provided event list up to a safe cap such as 200 events.
- Use `useRef` to detect whether the user is near the bottom.
- Auto-scroll only when the user was already near the bottom.
- Add a `Jump to latest` button when new events arrive while scrolled upward.
- Use `aria-live="polite"` for new event announcements without stealing focus.
- Preserve long messages with wrapping; do not use `text-overflow: ellipsis` for conversation content.

**Step 3: Verify and commit**

```bash
npm run test:e2e -- --grep "activity"
 git add components/cardfall/ActivityFeed.tsx components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "feat: add scrollable Cardfall activity history"
```

---

## Task 8: Add each-player private deduction notebook

**Objective:** Give every player a private list of their own questions and answers with manual crossing-out/annotation.

**Files:**
- Create: `lib/games/cardfall/notebook.ts`
- Create: `lib/games/cardfall/notebook.test.ts`
- Create: `components/cardfall/NotebookPanel.tsx`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Write failing notebook tests**

```ts
it('adds a note when the player asks a question', () => {
  const notes = addQuestionNote([], {
    questionId: 'q1', targetId: 'b', targetName: 'Guest',
    question: 'Do you have a red card?', answer: true,
  });
  expect(notes[0]).toMatchObject({ questionId: 'q1', answer: true, crossedOut: false });
});

it('toggles crossed-out state without mutating the prior list', () => {
  const notes = addQuestionNote([], noteFixture);
  const next = toggleNote(notes, notes[0].id);
  expect(next[0].crossedOut).toBe(true);
  expect(notes[0].crossedOut).toBe(false);
});
```

**Step 2: Implement the notebook model**

```ts
export type NotebookNote = {
  id: string;
  questionId: string;
  targetId: string;
  targetName: string;
  question: string;
  answer?: boolean;
  crossedOut: boolean;
  annotation: string;
  createdAt: number;
};
```

Provide pure `addQuestionNote`, `setAnswer`, `toggleNote`, and `updateAnnotation` functions.

**Step 3: Implement browser-local persistence**

- Storage key: `cardfall:notebook:${roomCode}:${canonicalPlayerId}`.
- Hydrate on room entry.
- Persist on every note change.
- Clear only on explicit `Clear notebook`, not on reconnect.
- Never send notebook contents to the server.
- Add a `Notebook` drawer/panel with:
  - `Questions I asked` heading
  - target name
  - question text
  - answer badge `YES`/`NO`/`PENDING`
  - checkbox/toggle `Cross out`
  - editable annotation field
  - clear action with confirmation

**Step 4: Wire structured events**

When a `question` event authored by the current player arrives, add a note. When its matching `answer` event arrives, update the answer. Do not duplicate notes on reconnect or resync; dedupe by `questionId`.

**Step 5: Verify and commit**

```bash
npm test -- --run lib/games/cardfall/notebook.test.ts
npm run test:e2e -- --grep "notebook"
 git add lib/games/cardfall/notebook.ts lib/games/cardfall/notebook.test.ts components/cardfall/NotebookPanel.tsx components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "feat: add private Cardfall deduction notebook"
```

---

## Task 9: Replace the Rules-as-error shortcut with an accessible help dialog

**Objective:** Make rules/instructions discoverable without making normal help look like a transport or form failure.

**Files:**
- Create: `components/cardfall/RulesDialog.tsx`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Step 1: Write a failing accessibility/browser test**

```ts
await page.getByRole('button', { name: 'Rules' }).click();
const dialog = page.getByRole('dialog', { name: /Cardfall rules/i });
await expect(dialog).toBeVisible();
await expect(dialog.getByText(/Ask a Yes\/No question/)).toBeVisible();
await page.keyboard.press('Escape');
await expect(dialog).toBeHidden();
```

**Step 2: Implement the dialog**

- Use native `<dialog>` or a correctly labeled modal.
- Move focus into the dialog on open and back to Rules on close.
- Close on Escape and an explicit close button.
- Render the selected game’s rule bullets and the current action guide.
- Do not call `setError` for rules.
- Give the button an accessible name and `aria-haspopup="dialog"`.

**Step 3: Add keyboard/focus styles**

- Add `:focus-visible` outlines for buttons, inputs, picker cells, tabs, and cards.
- Do not use `outline: 0` without a replacement.
- Add `aria-live` status for turn/sync/errors.

**Step 4: Commit**

```bash
git add components/cardfall/RulesDialog.tsx components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "fix: make Cardfall rules accessible"
```

---

## Task 10: Add presence, readiness, host continuity, and safe rejoin

**Objective:** Prevent a disconnected host or ambiguous “ready” label from leaving guests waiting indefinitely.

**Files:**
- Modify: `server/index.ts`
- Modify: `lib/protocol.ts`
- Modify: `components/TableView.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`
- Test: new `tests/realtime/room-lifecycle.test.ts` or a deterministic WebSocket protocol harness

**Step 1: Write failing protocol/browser tests**

Cover:

- Player presence status changes on connect/disconnect.
- A player is not labeled `ready` unless they explicitly press Ready.
- Host disconnect produces a visible `Host left` state.
- Host transfer occurs only according to a deterministic rule, such as earliest connected player or explicit host claim.
- Reloading the same tab preserves room code, canonical player ID, and session token and re-enters exactly once.
- A new tab with no valid token gets a clear rejoin path instead of impersonating the old player.

**Step 2: Add authoritative lifecycle state**

- Add `presence: 'connected'|'reconnecting'|'left'` per player.
- Add `ready: boolean` per player.
- Add `hostId` transfer/recovery policy.
- Persist room credentials in session storage/local storage only as appropriate; never persist the bearer token in URLs.
- Clear credentials on intentional leave.
- Add server-side reconnect grace period before marking a player left.

**Step 3: Implement UI**

- Show connected/ready badges in the turn rail and runtime player board.
- Replace “ready” placeholder text with actual state.
- Show `Host disconnected — waiting for rejoin` or `Host transferred to X`.
- Add a Retry/Rejoin button that preserves the typed name and room code.

**Step 4: Verify and commit**

```bash
npm run test:e2e -- --grep "presence|rejoin|host"
 git add server/index.ts lib/protocol.ts components/TableView.tsx app/globals.css tests/e2e/cardfall.spec.ts
 git commit -m "fix: harden room presence and rejoin"
```

---

## Task 11: Fix accessibility and reduced-motion behavior

**Objective:** Make the room usable by keyboard, screen reader, and reduced-motion users.

**Files:**
- Modify: `components/TableView.tsx`
- Modify: `components/cardfall/*.tsx`
- Modify: `app/globals.css`
- Create or configure: `tests/e2e/accessibility.spec.ts`

**Requirements:**

- Add explicit labels for every input, select, picker cell, player chip, chat field, room code, and action button.
- Give the icon-only back button an accessible name.
- Add `aria-pressed` to mode tabs and selected game/card controls.
- Add `aria-live="polite"` status for connection, turn, question arrival, answer arrival, chat, and topple announcements.
- Ensure focus is moved to an incoming Yes/No answer panel only when appropriate and returned after response.
- Add visible `:focus-visible` style with adequate contrast.
- Ensure all primary controls meet 44×44 CSS-pixel minimum touch target.
- Add reduced-motion CSS for topple animation, card hover transforms, table transitions, and perspective effects.
- Ensure color is not the only indicator for active player, suit, answer, or crossed-out note.

**Verification:**

```bash
npm run test:e2e -- --grep accessibility
```

If Axe is added, run it against lobby, Cardfall lobby, Cardfall playing state, runtime Blackjack, and the rules/notebook dialogs. Fix all serious/critical findings before release.

---

## Task 12: Finish-state UX, clipboard feedback, and mobile overflow

**Objective:** Close the remaining persona gaps around completion, inviting, and compact screens.

**Files:**
- Modify: `components/TableView.tsx`
- Create: `components/cardfall/FinishSummary.tsx`
- Modify: `app/globals.css`
- Test: `tests/e2e/cardfall.spec.ts`

**Requirements:**

- Show winner name, ranking order, topple counts, and final public pile.
- Provide a clear `Rematch` action that creates a new lobby state only when authorized, or a `New table` action if rematch is not implemented.
- Copy-room-code action shows `Copied` for a short accessible status duration.
- Provide clipboard-denied fallback: select/copy text or show the code prominently.
- Keep room code/invite access available after the game starts and on mobile.
- Test 390px and 768px layouts with 2, 4, and 8 players.
- Prevent body-level horizontal overflow while allowing intentional turn/activity scrolling.

**Verification:**

```bash
npm run test:e2e -- --grep "finish|clipboard|mobile|overflow"
```

---

## Task 13: Run the exhaustive QA matrix

**Objective:** Verify the complete product against the user’s requested behavior before deployment.

**Files:**
- Modify: `tests/e2e/cardfall.spec.ts`
- Create: `tests/e2e/cardfall-reconnect.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/realtime/protocol.spec.ts`

**Required scenarios:**

1. Guest lobby with blank name, invalid room code, valid create, and preserved form input after failure.
2. Host creates Cardfall with 3 cards/player; guest joins without selecting a conflicting game; both resolve the room as Cardfall.
3. Two/three/four-player turn rotation with ask, answer, wrong guess, correct guess, elimination, and ranking.
4. Card picker uses no card dropdown; suit/rank controls produce the exact card ID.
5. Successful topple animates and appears in the public pool; pool dialog shows all toppled cards.
6. Wrong guess rotates turn and does not reveal a hidden card.
7. Activity feed supports many events, scrolls, and jumps to latest.
8. Notebook creates/updates/deduplicates private question notes and persists on reload.
9. Blackjack start, Hit, Stand, dealer reveal, and private dealer/player cards.
10. Solitaire start, Draw, waste/stock behavior, and variant-specific copy.
11. High Card two-player start, hidden cards, simultaneous reveal, winner.
12. Hold’em two-player start, private hole cards, community streets, Check progression.
13. Host-only start, malformed commands, stale versions, duplicate command IDs, cross-room socket use, and invalid session tokens.
14. Disconnect/reconnect, host departure, rejoin, and state resync.
15. Desktop, mobile, keyboard-only, reduced-motion, and dialog focus behavior.
16. Public production URL with the Render WebSocket endpoint.

**Commands:**

```bash
npm test -- --run
npm run typecheck
npm run build
npm run test:e2e
E2E_BASE_URL=https://card-table-arena.vercel.app npm run test:e2e
```

Expected: all commands pass with no new warnings/errors. Keep Playwright artifacts ignored by `.gitignore`.

---

## Task 14: Review, commit, deploy, and verify production

**Objective:** Ship only the candidate that passes local and production checks and has an independent security review.

**Files:**
- All files changed by Tasks 1–13
- `README.md`
- `RELEASE.md`
- `.gitignore`

**Step 1: Update documentation honestly**

- Document exact supported action depth for every game.
- Document Cardfall picker, toppled pool, notebook, rules dialog, rejoin, and presence.
- Document process-local persistence limitation if durable storage is not implemented.
- Remove claims for settings or rules that are still decorative.

**Step 2: Run static/release checks**

```bash
git diff --cached
git diff --cached --check
npm test -- --run
npm run typecheck
npm run build
docker compose config
docker build -t card-table-arena:release .
```

**Step 3: Request independent review**

Review must fail closed on:

- private-card leaks
- missing command/session/room/version validation
- mismatched game state and client controls
- nonfunctional advertised settings
- runtime protocol enum mismatch
- wrong turn rotation
- reconnect identity loss
- missing public toppled-card privacy rationale
- unsafe or misleading deployment config

Do not treat an interrupted/rate-limited review as approval.

**Step 4: Commit and push**

```bash
git add -A
git commit -m "feat: complete Cardfall interaction and deduction UX"
git push origin main
```

**Step 5: Verify deployment**

- Wait for Vercel production deployment from the pushed commit to reach `READY`.
- Wait for Render realtime deployment to reach `live`.
- Verify:

```bash
curl -fsS https://card-table-arena.vercel.app/api/config
curl -fsS https://card-table-arena-realtime.onrender.com/
```

- Run the production Playwright matrix.
- Run a direct WebSocket two/three-client protocol probe with deterministic timer cleanup.
- Record deployment commit IDs and test results.

**Step 6: Report limitations accurately**

Only say “zero reproducible issues in the tested matrix” if every acceptance test passes. Do not say “zero issues whatsoever” while room state, sessions, and command dedupe remain process-local across restarts or while any advertised setting is decorative.

---

## Risks, tradeoffs, and open questions

- **Public toppled pile:** Reveals successfully guessed cards to everyone. This is intentional and justified because the identity was correctly guessed; wrong guesses still reveal nothing.
- **Notebook privacy:** Browser-local notes survive refresh on the same device but not a new device/browser unless a future authenticated sync feature is added.
- **Timer behavior:** A client countdown is not authoritative. Either implement server deadlines or remove the timer option.
- **Secondary games:** This plan gives them truthful room actions and adapter behavior, but full poker betting/fold/raise, complete Solitaire foundation movement, and Blackjack wagering require separate rule-completeness work.
- **Persistence:** Process-local room state is acceptable for a single-instance demo only. Durable Supabase-backed room/session/event storage is a separate production-hardening phase.
- **Animation:** Use CSS transitions by default and honor `prefers-reduced-motion`; never make a card animation the only way to understand a topple.
- **Join UX:** A joiner should enter only their name and room code; the host’s game and settings must be authoritative. Do not ask joiners to choose a conflicting game.
- **Finish state:** Ranking must be rendered from authoritative state, not inferred from client event text.

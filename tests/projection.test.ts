import { describe, expect, it } from 'vitest';
import { initial, reduce } from '../lib/games/cardfall/engine';
import { publicProjection } from '../lib/games/cardfall/projection';

const startedState = (cardsPerPlayer = 2) =>
  reduce(
    initial([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]),
    { type: 'START', seed: 1, cardsPerPlayer },
  );

describe('Cardfall private projections', () => {
  it('reveals only the viewer hand and removed cards', () => {
    let state = startedState(1);
    const card = state.players[1].hand[0];
    state = reduce(state, { type: 'GUESS', actorId: 'a', targetId: 'b', cardId: card.id });

    const projection = publicProjection(state, 'a');
    expect(projection.players[0].hand[0].id).not.toBe('hidden');
    expect(projection.players[1].hand).toHaveLength(0);
    expect(projection.players[1].removed[0].id).toBe('hidden');
  });

  it('exposes the public toppled pile while hiding opponent hand and removed collections', () => {
    let state = startedState();
    const toppledCard = state.players[1].hand[0];
    state = reduce(state, { type: 'GUESS', actorId: 'a', targetId: 'b', cardId: toppledCard.id });

    const projection = publicProjection(state, 'a');
    const opponent = projection.players.find((player) => player.id === 'b')!;

    expect(projection.toppledCards).toContainEqual(toppledCard);
    expect(projection.lastTopple).toMatchObject({
      cardId: toppledCard.id,
      actorId: 'a',
      targetId: 'b',
    });
    expect(opponent.hand.every((card) => card.id === 'hidden')).toBe(true);
    expect(opponent.removed.every((card) => card.id === 'hidden')).toBe(true);
  });

  it('does not expose an unguessed opponent card in state metadata, projection, structured events, or serialized output', () => {
    let state = startedState();
    const unknownOpponentCardId = state.players[1].hand[0].id;
    state = reduce(state, {
      type: 'GUESS',
      actorId: 'a',
      targetId: 'b',
      cardId: 'not-in-the-opponent-hand',
    });

    const wrongGuess = state.events.at(-1)!;
    const projection = publicProjection(state, 'a');

    expect(state.toppledCards).toEqual([]);
    expect(state.lastTopple).toBeUndefined();
    expect(wrongGuess.kind).toBe('guess');
    expect(wrongGuess).not.toHaveProperty('cardId');
    expect(JSON.stringify({ lastTopple: state.lastTopple, events: state.events })).not.toContain(
      unknownOpponentCardId,
    );
    expect(JSON.stringify(projection)).not.toContain(unknownOpponentCardId);
  });

  it('redacts card identities from non-topple structured events in public projections', () => {
    let state = startedState();
    const unknownOpponentCardId = state.players[1].hand[0].id;
    state = reduce(state, {
      type: 'GUESS',
      actorId: 'a',
      targetId: 'b',
      cardId: 'not-in-the-opponent-hand',
    });
    const wrongGuess = state.events.at(-1)!;
    const legacyState = {
      ...state,
      events: [...state.events.slice(0, -1), { ...wrongGuess, cardId: unknownOpponentCardId }],
    };

    const projection = publicProjection(legacyState, 'a');
    const projectedEvent = projection.events.at(-1)!;

    expect(projectedEvent.kind).toBe('guess');
    expect(projectedEvent).not.toHaveProperty('cardId');
    expect(JSON.stringify(projection)).not.toContain(unknownOpponentCardId);
  });
});

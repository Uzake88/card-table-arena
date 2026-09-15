import { Card, createDeck, shuffle } from '../../cards/deck';
import type { CardfallEvent, CardfallEventKind } from './events';

export type Player = {
  id: string;
  name: string;
  hand: Card[];
  removed: Card[];
  correctGuesses: number;
  eliminatedAt?: number;
};

export type PendingQuestion = {
  questionId: string;
  askerId: string;
  targetId: string;
  question: string;
};

export type LastTopple = {
  sequence: number;
  cardId: string;
  actorId: string;
  targetId: string;
};

export type TurnReason = 'move' | 'answer' | 'setup' | 'finished';

export type CardfallState = {
  phase: 'lobby' | 'playing' | 'finished';
  players: Player[];
  turn: number;
  turnNumber: number;
  turnReason: TurnReason;
  cardsPerPlayer: number;
  events: CardfallEvent[];
  ranking: string[];
  toppledCards: Card[];
  lastTopple?: LastTopple;
  pendingQuestion?: PendingQuestion;
};

export type Action =
  | { type: 'START'; seed?: number; cardsPerPlayer?: number }
  | { type: 'GUESS'; actorId: string; targetId: string; cardId: string }
  | { type: 'ASK'; actorId: string; targetId: string; question: string }
  | { type: 'ANSWER'; actorId: string; yes: boolean };

const nextTurn = (s: CardfallState, idx: number) => {
  for (let n = 1; n <= s.players.length; n++) {
    const i = (idx + n) % s.players.length;
    if (s.players[i].hand.length > 0) return i;
  }
  return idx;
};

const setTurn = (s: CardfallState, index: number, reason: Exclude<TurnReason, 'setup' | 'finished'>) => {
  if (!s.players[index] || s.players[index].hand.length === 0) {
    throw Error('No eligible player for turn');
  }
  if (s.turn !== index) s.turnNumber++;
  s.turn = index;
  s.turnReason = reason;
};

const makeEvent = (
  kind: CardfallEventKind,
  text: string,
  metadata: Omit<CardfallEvent, 'id' | 'kind' | 'text'> = {},
): CardfallEvent => ({ id: crypto.randomUUID(), kind, text, ...metadata });

export function initial(players: Pick<Player, 'id' | 'name'>[]): CardfallState {
  return {
    phase: 'lobby',
    players: players.map((p) => ({ ...p, hand: [], removed: [], correctGuesses: 0 })),
    turn: 0,
    turnNumber: 0,
    turnReason: 'setup',
    cardsPerPlayer: 5,
    events: [],
    ranking: [],
    toppledCards: [],
  };
}

export function reduce(state: CardfallState, action: Action): CardfallState {
  const s: CardfallState = structuredClone(state);

  if (action.type === 'START') {
    if (s.phase !== 'lobby') throw Error('Game has already started');
    if (s.players.length < 2) throw Error('Need at least two players');
    const n = action.cardsPerPlayer ?? 5;
    if (n < 1 || n > 10) throw Error('Cards per player must be 1-10');
    if (s.players.length * n > 52) throw Error('Not enough cards for this table');
    const deck = shuffle(createDeck(), action.seed);
    s.cardsPerPlayer = n;
    s.players.forEach((p, i) => {
      p.hand = deck.slice(i * n, (i + 1) * n);
    });
    s.phase = 'playing';
    s.turn = 0;
    s.turnNumber = 0;
    s.turnReason = 'setup';
    s.events.push(makeEvent('deal', `The table dealt ${n} cards to each player.`, { tone: 'deal' }));
    return s;
  }

  if (s.phase !== 'playing') throw Error('Game is not active');
  const actor = s.players[s.turn];

  if (s.pendingQuestion && action.type !== 'ANSWER') throw Error('Answer the pending question');

  if (action.type === 'ASK') {
    if (action.actorId !== actor.id) throw Error('Not your turn');
    const target = s.players.find((p) => p.id === action.targetId);
    if (!target || target.id === actor.id || target.hand.length === 0) {
      throw Error('Choose a player with cards');
    }
    if (!action.question.trim() || action.question.length > 120) {
      throw Error('Question must be 1-120 characters');
    }

    const question = action.question.trim();
    const questionId = crypto.randomUUID();
    s.pendingQuestion = { questionId, askerId: actor.id, targetId: target.id, question };
    s.events.push(
      makeEvent('question', `${actor.name} asked ${target.name}: “${question}”`, {
        actorId: actor.id,
        targetId: target.id,
        questionId,
        question,
      }),
    );
    setTurn(s, s.players.indexOf(target), 'answer');
    return s;
  }

  if (action.type === 'ANSWER') {
    const target = s.players[s.turn];
    const question = s.pendingQuestion;
    if (!question || question.targetId !== action.actorId || target.id !== action.actorId) {
      throw Error('Only the selected target can answer');
    }
    s.events.push(
      makeEvent('answer', `${target.name} answered ${action.yes ? 'YES' : 'NO'}`, {
        actorId: target.id,
        targetId: question.askerId,
        questionId: question.questionId,
        answer: action.yes,
        tone: action.yes ? 'yes' : 'no',
      }),
    );
    delete s.pendingQuestion;
    setTurn(s, nextTurn(s, s.turn), 'move');
    return s;
  }

  if (action.type === 'GUESS') {
    if (action.actorId !== actor.id) throw Error('Not your turn');
    const target = s.players.find((p) => p.id === action.targetId);
    if (!target || target.id === actor.id) throw Error('Choose another player');

    const index = target.hand.findIndex((c) => c.id === action.cardId);
    if (index < 0) {
      s.events.push(
        makeEvent('guess', `${actor.name} guessed wrong.`, {
          actorId: actor.id,
          targetId: target.id,
          tone: 'miss',
        }),
      );
      setTurn(s, nextTurn(s, s.turn), 'move');
      return s;
    }

    const [card] = target.hand.splice(index, 1);
    target.removed.push(card);
    actor.correctGuesses++;
    s.toppledCards.push(card);
    s.lastTopple = {
      sequence: s.toppledCards.length,
      cardId: card.id,
      actorId: actor.id,
      targetId: target.id,
    };
    s.events.push(
      makeEvent('topple', `${actor.name} toppled a card from ${target.name}'s hand.`, {
        actorId: actor.id,
        targetId: target.id,
        cardId: card.id,
        tone: 'hit',
      }),
    );

    if (target.hand.length === 0) {
      target.eliminatedAt = s.events.length;
      s.ranking.push(target.id);
      s.events.push(
        makeEvent('elimination', `${target.name} has been toppled from the table.`, {
          targetId: target.id,
          tone: 'out',
        }),
      );
    }

    const alive = s.players.filter((p) => p.hand.length);
    if (alive.length <= 1) {
      s.phase = 'finished';
      s.turnReason = 'finished';
      if (alive[0]) s.ranking.push(alive[0].id);
      s.events.push(makeEvent('win', `${alive[0]?.name ?? 'The table'} wins Cardfall.`, { tone: 'win' }));
    } else {
      setTurn(s, nextTurn(s, s.turn), 'move');
    }
    return s;
  }

  return s;
}

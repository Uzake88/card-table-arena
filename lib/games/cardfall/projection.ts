import type { CardfallEvent } from './events';
import type { CardfallState } from './engine';

export type PublicCard = { id: string; rank: string; suit: string };
type PublicCardfallEvent = Omit<CardfallEvent, 'cardId'> & { cardId?: string };
type PublicLastTopple = NonNullable<CardfallState['lastTopple']>;

export type PublicCardfallState = Omit<CardfallState, 'players' | 'events' | 'lastTopple'> & {
  players: Array<
    Omit<CardfallState['players'][number], 'hand' | 'removed'> & {
      hand: PublicCard[];
      removed: PublicCard[];
    }
  >;
  events: PublicCardfallEvent[];
  lastTopple?: PublicLastTopple;
  presence?: string[];
};

const hidden: PublicCard = { id: 'hidden', rank: '?', suit: '?' };

function projectEvent(event: CardfallEvent, publicCardIds: Set<string>): PublicCardfallEvent {
  const { cardId, ...publicEvent } = event;
  if (event.kind === 'topple' && cardId && publicCardIds.has(cardId)) {
    return { ...publicEvent, cardId };
  }
  return publicEvent;
}

export function publicProjection(state: CardfallState, viewerId: string, presence: string[] = []): PublicCardfallState {
  const publicCardIds = new Set(state.toppledCards.map((card) => card.id));
  const lastTopple =
    state.lastTopple && publicCardIds.has(state.lastTopple.cardId) ? state.lastTopple : undefined;

  return {
    ...state,
    events: state.events.map((event) => projectEvent(event, publicCardIds)),
    lastTopple,
    presence,
    players: state.players.map((p) => ({
      ...p,
      hand: p.id === viewerId ? p.hand : p.hand.map(() => hidden),
      removed: p.id === viewerId ? p.removed : p.removed.map(() => hidden),
    })),
  };
}

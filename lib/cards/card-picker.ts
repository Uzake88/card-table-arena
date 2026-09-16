import { createDeck, type Card, type Rank, type Suit } from './deck';

export type { Rank, Suit } from './deck';

export function cardIdForSelection(rank: Rank, suit: Suit): string {
  return `${rank}${suit}`;
}

export function allCardOptions(): Card[] {
  return createDeck();
}

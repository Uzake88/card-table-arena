export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];
export type Card = { id: string; suit: Suit; rank: Rank };
export function createDeck(): Card[] { return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${rank}${suit}`, suit, rank }))); }
export function shuffle<T>(items: T[], seed = Math.random() * 2147483647): T[] { const out = [...items]; let s = Math.floor(seed) || 1; const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }

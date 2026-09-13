import type { CardfallState } from './engine';
export type PublicCard = { id: string; rank: string; suit: string };
export type PublicCardfallState = Omit<CardfallState, 'players'> & { players: Array<Omit<CardfallState['players'][number], 'hand'|'removed'> & { hand: PublicCard[]; removed: PublicCard[] }> };
const hidden: PublicCard = {id: 'hidden', rank: '?', suit: '?'};
export function publicProjection(state: CardfallState, viewerId: string): PublicCardfallState { return {...state, players: state.players.map((p) => ({...p, hand: p.id === viewerId ? p.hand : p.hand.map(() => hidden), removed: p.id === viewerId ? p.removed : p.removed.map(() => hidden)}))}; }

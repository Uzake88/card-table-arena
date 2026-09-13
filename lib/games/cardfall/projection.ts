import type { CardfallState } from './engine';
export type PublicCard = { id: string; rank: string; suit: string };
export type PublicCardfallState = Omit<CardfallState, 'players'> & { players: Array<Omit<CardfallState['players'][number], 'hand'> & { hand: PublicCard[] }> };
export function publicProjection(state: CardfallState, viewerId: string): PublicCardfallState { return {...state, players: state.players.map((p) => ({...p, hand: p.id === viewerId ? p.hand : p.hand.map(() => ({id: 'hidden', rank: '?', suit: '?'}))}))}; }

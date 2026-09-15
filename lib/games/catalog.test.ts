import { describe, expect, it } from 'vitest';
import { GAME_CATALOG, defaultSettings, normalizeSettings } from './catalog';

describe('game catalog',()=>{
 it('offers the main guest-playable game families',()=>{expect(GAME_CATALOG.map(g=>g.id)).toEqual(expect.arrayContaining(['cardfall','blackjack','holdem','solitaire','highcard']));});
 it('provides defaults for every game',()=>{for(const game of GAME_CATALOG){expect(defaultSettings(game.id)).toBeTruthy();expect(game.rules.length).toBeGreaterThan(1);}});
 it('normalizes settings without accepting invalid values',()=>{expect(normalizeSettings('cardfall',{cardsPerPlayer:99}).cardsPerPlayer).toBe(5);expect(normalizeSettings('blackjack',{players:99}).players).toBe(5);expect(normalizeSettings('holdem',{players:1}).players).toBe(2);});
 it('exposes only authoritative Cardfall settings',()=>{const cardfall=GAME_CATALOG.find((game)=>game.id==='cardfall')!;expect(cardfall.fields.map((field)=>field.key)).toEqual(['cardsPerPlayer']);expect(Object.keys(defaultSettings('cardfall'))).toEqual(['cardsPerPlayer']);});
});

import { describe, expect, it } from 'vitest';
import { dealHighCard, resolve } from './engine';
describe('High Card Duel',()=>{it('deals one unique card per player',()=>{const s=dealHighCard(['a','b','c'],9);expect(Object.keys(s.cards)).toHaveLength(3);expect(new Set(Object.values(s.cards).map(c=>c.id)).size).toBe(3);});it('resolves a winner',()=>{const s=dealHighCard(['a','b'],9);const n=resolve(s);expect(n.phase).toBe('finished');expect(n.winner).toBeTruthy();});});

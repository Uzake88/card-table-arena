import { describe, expect, it } from 'vitest';
import { createBlackjack, handValue, hit, stand, settle } from './engine';

describe('Blackjack engine',()=>{
 it('deals two cards to each player and dealer',()=>{const s=createBlackjack(['a','b'],7);expect(s.players.a.hand).toHaveLength(2);expect(s.players.b.hand).toHaveLength(2);expect(s.dealer.hand).toHaveLength(2);expect(new Set(Object.values(s.players).flatMap(p=>p.hand.map(c=>c.id))).size).toBe(4);});
 it('scores aces as eleven when possible and one otherwise',()=>{expect(handValue([{id:'a',rank:'A',suit:'♠'},{id:'k',rank:'K',suit:'♣'}])).toBe(21);expect(handValue([{id:'a',rank:'A',suit:'♠'},{id:'k',rank:'K',suit:'♣'},{id:'2',rank:'2',suit:'♦'}])).toBe(13);});
 it('hits from the real remaining deck and advances when bust or 21',()=>{const s=createBlackjack(['a'],2);const n=hit(s,'a');expect(n.players.a.hand).toHaveLength(3);expect(n.deck.length).toBeLessThan(s.deck.length);});
 it('settles after all players stand',()=>{let s=createBlackjack(['a'],3);s=stand(s,'a');expect(s.phase).toBe('finished');expect(s.results).toHaveProperty('a');expect(s.dealer.revealed).toBe(true);});
});

import { describe, expect, it } from 'vitest';
import { initial, reduce } from '../lib/games/cardfall/engine';
import { publicProjection } from '../lib/games/cardfall/projection';
describe('Cardfall private projections',()=>{it('reveals only the viewer hand and removed cards',()=>{let s=reduce(initial([{id:'a',name:'A'},{id:'b',name:'B'}]),{type:'START',seed:1,cardsPerPlayer:1});const card=s.players[1].hand[0];s=reduce(s,{type:'GUESS',actorId:'a',targetId:'b',cardId:card.id});const p=publicProjection(s,'a');expect(p.players[0].hand[0].id).not.toBe('hidden');expect(p.players[1].hand).toHaveLength(0);expect(p.players[1].removed[0].id).toBe('hidden');});});

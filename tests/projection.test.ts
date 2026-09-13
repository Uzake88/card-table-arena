import { describe, expect, it } from 'vitest';
import { initial, reduce } from '../lib/games/cardfall/engine';
import { publicProjection } from '../lib/games/cardfall/projection';
describe('Cardfall private projections',()=>{it('reveals only the viewer hand',()=>{const s=reduce(initial([{id:'a',name:'A'},{id:'b',name:'B'}]),{type:'START',seed:1});const p=publicProjection(s,'a');expect(p.players[0].hand[0].id).not.toBe('hidden');expect(p.players[1].hand[0].id).toBe('hidden');expect(p.players[1].hand[0].rank).toBe('?');});});

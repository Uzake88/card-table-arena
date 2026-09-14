import { describe, expect, it } from 'vitest';
import { createLobby, addPlayer, projectRuntime, reduceRuntime } from './runtime';

describe('runtime private projections',()=>{
 it('hides opponent cards before reveal and exposes only the viewer hand',()=>{let s=addPlayer(createLobby('highcard',{}),{id:'a',name:'A'});s=addPlayer(s,{id:'b',name:'B'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:3});const p=projectRuntime(s,'a');expect(p.players.find(x=>x.id==='a')?.hand[0].id).not.toBe('hidden');expect(p.players.find(x=>x.id==='b')?.hand[0].id).toBe('hidden');});
 it('reveals both cards only after both players reveal',()=>{let s=addPlayer(createLobby('highcard',{}),{id:'a',name:'A'});s=addPlayer(s,{id:'b',name:'B'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:3});s=reduceRuntime(s,{type:'REVEAL',actorId:'a'});expect(s.phase).toBe('playing');s=reduceRuntime(s,{type:'REVEAL',actorId:'b'});expect(s.phase).toBe('finished');expect(projectRuntime(s,'a').players.find(x=>x.id==='b')?.hand[0].id).not.toBe('hidden');});
});

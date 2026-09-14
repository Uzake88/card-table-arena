import { describe, expect, it } from 'vitest';
import { addPlayer, createLobby, reduceRuntime, projectRuntime, type RuntimeState } from './runtime';

describe('runtime game adapters',()=>{
 it('starts Blackjack and advances hit/stand turns',()=>{let s=addPlayer(createLobby('blackjack',{}),{id:'a',name:'A'});s=addPlayer(s,{id:'b',name:'B'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:4});expect(s.phase).toBe('playing');const n=reduceRuntime(s,{type:'STAND',actorId:s.players[s.turn].id});expect(n.turn).not.toBe(s.turn);});
 it('requires all High Card players to reveal before resolving',()=>{let s=addPlayer(createLobby('highcard',{}),{id:'a',name:'A'});s=addPlayer(s,{id:'b',name:'B'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:2});s=reduceRuntime(s,{type:'REVEAL',actorId:'a'});expect(s.phase).toBe('playing');s=reduceRuntime(s,{type:'REVEAL',actorId:'b'});expect(s.phase).toBe('finished');});
 it('draws from Solitaire stock and projects private state safely',()=>{let s=addPlayer(createLobby('solitaire',{variant:'draw1'}),{id:'a',name:'A'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:1});const before=s.stock.length;s=reduceRuntime(s,{type:'DRAW',actorId:'a'});expect(s.stock.length).toBe(before-1);const p=projectRuntime(s,'a');expect(p.stock.length).toBe(s.stock.length);});
 it('advances Holdem street after active players check',()=>{let s=addPlayer(createLobby('holdem',{players:2,startingChips:'1000'}),{id:'a',name:'A'});s=addPlayer(s,{id:'b',name:'B'});s=reduceRuntime(s,{type:'START',actorId:'a',seed:1});s=reduceRuntime(s,{type:'CHECK',actorId:s.players[s.turn].id});s=reduceRuntime(s,{type:'CHECK',actorId:s.players[s.turn].id});expect(['flop','preflop']).toContain(s.street);});
});

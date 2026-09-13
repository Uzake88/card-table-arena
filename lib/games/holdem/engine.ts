import { Card, createDeck, shuffle } from '../../cards/deck';
export type HoldemState={phase:'preflop'|'flop'|'turn'|'river'|'showdown';players:string[];holes:Record<string,Card[]>;community:Card[];pot:number;turn:number};
export function dealHoldem(players:string[],seed=1):HoldemState{if(players.length<2||players.length>8)throw Error('Hold’em supports 2-8 players');const d=shuffle(createDeck(),seed);const holes=Object.fromEntries(players.map((id,i)=>[id,[d[i],d[i+players.length]]]));return {phase:'preflop',players,holes,community:d.slice(players.length*2+1,players.length*2+6),pot:0,turn:0}}
export function reveal(s:HoldemState):HoldemState{const phase=s.phase==='preflop'?'flop':s.phase==='flop'?'turn':s.phase==='turn'?'river':'showdown';return {...s,phase}}

import { Card, createDeck, shuffle } from '../../cards/deck';
export type HighCardState={phase:'playing'|'finished';players:string[];cards:Record<string,Card>;winner?:string};
export function dealHighCard(players:string[],seed=1):HighCardState{const d=shuffle(createDeck(),seed);return {phase:'playing',players,cards:Object.fromEntries(players.map((id,i)=>[id,d[i]]))}}
export function resolve(s:HighCardState):HighCardState{const value=(r:string)=>r==='A'?14:['K','Q','J'].includes(r)?({K:13,Q:12,J:11} as any)[r]:Number(r);const winner=s.players.reduce((a,b)=>value(s.cards[a].rank)>=value(s.cards[b].rank)?a:b);return {...s,phase:'finished',winner}}

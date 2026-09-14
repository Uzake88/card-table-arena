export type GameId='cardfall'|'blackjack'|'holdem'|'solitaire'|'highcard';
export type GameEvent={id:string;text:string;tone?:string};
export type SharedGameState={phase:'lobby'|'playing'|'finished';players:Array<{id:string;name:string;handCount:number}>;turn:number;events:GameEvent[];gameId:GameId;settings:Record<string,string|number|boolean>;version:number};
export type GameAction={type:'START'|'HIT'|'STAND'|'DRAW'|'REVEAL'|'CHAT';actorId:string};
export function roomGameLabel(id:GameId){return id==='cardfall'?'Cardfall':id==='blackjack'?'Blackjack':id==='holdem'?'Texas Hold’em':id==='solitaire'?'Solitaire':'High Card Duel';}

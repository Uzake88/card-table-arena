import { dealBlackjack } from './blackjack/engine';
import { dealHoldem } from './holdem/engine';
import { dealHighCard } from './high-card/engine';
import { initial } from './cardfall/engine';
export const GAME_REGISTRY={cardfall:{label:'Cardfall',min:2,max:8,create:initial},blackjack:{label:'Blackjack',min:1,max:5,create:dealBlackjack},holdem:{label:'Texas Hold’em',min:2,max:8,create:dealHoldem},highcard:{label:'High Card Duel',min:2,max:8,create:dealHighCard}} as const;
export type GameId=keyof typeof GAME_REGISTRY;

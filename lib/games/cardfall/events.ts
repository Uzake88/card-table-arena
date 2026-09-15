export type CardfallEventKind =
  | 'deal'
  | 'question'
  | 'answer'
  | 'guess'
  | 'topple'
  | 'elimination'
  | 'win'
  | 'chat';

export type CardfallEvent = {
  id: string;
  kind: CardfallEventKind;
  text: string;
  tone?: string;
  actorId?: string;
  targetId?: string;
  questionId?: string;
  question?: string;
  answer?: boolean;
  cardId?: string;
};

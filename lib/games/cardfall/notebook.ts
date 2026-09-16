import type { CardfallEvent } from './events';

export type NotebookNote = {
  id: string;
  targetId: string;
  targetName: string;
  question: string;
  answer?: boolean;
  crossedOut: boolean;
  annotation: string;
  createdAt: number;
};

export function createNotebookNote({
  questionId,
  targetId,
  targetName,
  question,
}: {
  questionId: string;
  targetId: string;
  targetName: string;
  question: string;
}): NotebookNote {
  return {
    id: questionId,
    targetId,
    targetName,
    question,
    crossedOut: false,
    annotation: '',
    createdAt: Date.now(),
  };
}

export function addQuestionNote(
  notes: NotebookNote[],
  event: CardfallEvent,
  actorId: string,
  targetName: string = event.targetId ?? 'Unknown player',
): NotebookNote[] {
  if (event.kind !== 'question' || event.actorId !== actorId || !event.questionId) return notes;
  if (notes.some((note) => note.id === event.questionId)) return notes;
  return [...notes, createNotebookNote({
    questionId: event.questionId,
    targetId: event.targetId ?? '',
    targetName,
    question: event.question ?? '',
  })];
}

export function setAnswer(
  notes: NotebookNote[],
  event: CardfallEvent,
  actorId: string,
): NotebookNote[] {
  if (event.kind !== 'answer' || event.targetId !== actorId || !event.questionId) return notes;
  return notes.map((note) => note.id === event.questionId ? { ...note, answer: event.answer } : note);
}

export function toggleNote(notes: NotebookNote[], noteId: string): NotebookNote[] {
  return notes.map((note) => note.id === noteId ? { ...note, crossedOut: !note.crossedOut } : note);
}

export function updateAnnotation(
  notes: NotebookNote[],
  noteId: string,
  annotation: string,
): NotebookNote[] {
  return notes.map((note) => note.id === noteId ? { ...note, annotation } : note);
}

export function clearNotebook(notes: NotebookNote[] = []): NotebookNote[] {
  return [];
}

export function notebookStorageKey(room: string, playerId: string): string {
  return `cardfall:notebook:${room}:${playerId}`;
}

export function loadNotebook(room: string, playerId: string): NotebookNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(notebookStorageKey(room, playerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((note): note is NotebookNote =>
      typeof note === 'object' && note !== null && typeof (note as NotebookNote).id === 'string'
    );
  } catch {
    return [];
  }
}

export function saveNotebook(room: string, playerId: string, notes: NotebookNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(notebookStorageKey(room, playerId), JSON.stringify(notes));
  } catch {
    // Ignore quota or storage errors; the notebook is a local convenience.
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { CardfallEvent } from './events';
import {
  addQuestionNote,
  clearNotebook,
  createNotebookNote,
  loadNotebook,
  saveNotebook,
  setAnswer,
  toggleNote,
  updateAnnotation,
  type NotebookNote,
} from './notebook';

const questionEvent = (overrides: Partial<CardfallEvent> = {}): CardfallEvent => ({
  id: 'event-1',
  kind: 'question',
  text: 'Host asked Guest: “Do you have a red card?”',
  actorId: 'me',
  targetId: 'guest',
  questionId: 'q1',
  question: 'Do you have a red card?',
  ...overrides,
});

const answerEvent = (overrides: Partial<CardfallEvent> = {}): CardfallEvent => ({
  id: 'event-2',
  kind: 'answer',
  text: 'Guest answered YES',
  actorId: 'guest',
  targetId: 'me',
  questionId: 'q1',
  answer: true,
  tone: 'yes',
  ...overrides,
});

describe('Cardfall notebook', () => {
  it('creates a question note without mutating the input array', () => {
    const notes: NotebookNote[] = [];
    const next = addQuestionNote(notes, questionEvent(), 'me');
    expect(notes).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'q1',
      targetId: 'guest',
      targetName: 'guest',
      question: 'Do you have a red card?',
      crossedOut: false,
      annotation: '',
    });
    expect(next[0].answer).toBeUndefined();
  });

  it('deduplicates question notes by questionId', () => {
    const first = addQuestionNote([], questionEvent(), 'me');
    const second = addQuestionNote(first, questionEvent({ id: 'event-dup' }), 'me');
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('q1');
  });

  it('updates the matching note with the answer', () => {
    const notes = addQuestionNote([], questionEvent(), 'me');
    const next = setAnswer(notes, answerEvent(), 'me');
    expect(next[0].answer).toBe(true);
    expect(next[0].question).toBe('Do you have a red card?');
  });

  it('toggles crossed-out immutably', () => {
    const notes = addQuestionNote([], questionEvent(), 'me');
    const next = toggleNote(notes, 'q1');
    expect(notes[0].crossedOut).toBe(false);
    expect(next[0].crossedOut).toBe(true);
  });

  it('updates annotation immutably', () => {
    const notes = addQuestionNote([], questionEvent(), 'me');
    const next = updateAnnotation(notes, 'q1', 'red suit');
    expect(notes[0].annotation).toBe('');
    expect(next[0].annotation).toBe('red suit');
  });

  it('clears notes', () => {
    const notes: NotebookNote[] = addQuestionNote([], questionEvent(), 'me');
    expect(clearNotebook(notes)).toEqual([]);
  });

  it('persists and loads notes through localStorage', () => {
    const storage = new Map<string, string>();
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => { storage.set(key, value); });
    const removeItem = vi.fn((key: string) => { storage.delete(key); });
    vi.stubGlobal('window', { localStorage: { getItem, setItem, removeItem } });
    try {
      const notes = addQuestionNote([], questionEvent(), 'me');
      saveNotebook('ROOM1', 'me', notes);
      expect(loadNotebook('ROOM1', 'me')).toEqual(notes);
      saveNotebook('ROOM1', 'me', clearNotebook(notes));
      expect(loadNotebook('ROOM1', 'me')).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

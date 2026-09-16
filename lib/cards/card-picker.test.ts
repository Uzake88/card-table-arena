import { describe, expect, it } from 'vitest';
import { allCardOptions, cardIdForSelection } from './card-picker';

describe('Cardfall card picker model', () => {
  it('returns the exact selected card ID from rank and suit', () => {
    expect(cardIdForSelection('A', '♦')).toBe('A♦');
  });

  it('lists all 52 unique selectable cards', () => {
    const cards = allCardOptions();

    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((card) => card.id)).size).toBe(52);
  });
});

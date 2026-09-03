import { describe, expect, it } from 'vitest';
import { parseComboSnapshot } from './comboSnapshot';

describe('parseComboSnapshot', () => {
  it('extracts the known display fields from a valid snapshot', () => {
    expect(
      parseComboSnapshot({
        permalink: 'https://commanderspellbook.com/combo/abc',
        cards: ['A', 'B'],
        produces: ['Infinite mana'],
        description: 'Tap, untap, repeat.',
      }),
    ).toEqual({
      permalink: 'https://commanderspellbook.com/combo/abc',
      cards: ['A', 'B'],
      produces: ['Infinite mana'],
      description: 'Tap, untap, repeat.',
    });
  });

  it('nulls a non-string permalink/description', () => {
    expect(parseComboSnapshot({ permalink: 42, description: { bad: true } })).toEqual({
      permalink: null,
      cards: [],
      produces: [],
      description: null,
    });
  });

  it('drops non-string entries from card/produces arrays', () => {
    expect(parseComboSnapshot({ cards: ['A', 3, 'B'], produces: ['Mana', null] })).toEqual({
      permalink: null,
      cards: ['A', 'B'],
      produces: ['Mana'],
      description: null,
    });
  });

  it('degrades a non-object blob to a safe empty snapshot', () => {
    expect(parseComboSnapshot('garbage')).toEqual({
      permalink: null,
      cards: [],
      produces: [],
      description: null,
    });
    expect(parseComboSnapshot(null)).toEqual({
      permalink: null,
      cards: [],
      produces: [],
      description: null,
    });
    expect(parseComboSnapshot([1, 2])).toEqual({
      permalink: null,
      cards: [],
      produces: [],
      description: null,
    });
  });
});

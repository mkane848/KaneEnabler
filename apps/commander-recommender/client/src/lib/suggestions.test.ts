/**
 * Tests for the "still has supporting cards" filter that keeps the card
 * display (and the filter bar's options) from showing a theme or kindred type the
 * server matched globally but that ended up with zero cards once narrowed
 * to this specific commander's color identity.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  visibleThemeLabels,
  visibleThemeSupport,
  visibleKindredSupport,
  visibleKindredTypes,
} from './suggestions';
import {
  makeKindredSupport,
  makeSuggestion,
  makeSupportingCard,
  makeThemeSupport,
} from '../test/fixtures';

const withCards = makeThemeSupport({
  key: 'sacrifice',
  label: 'Sacrifice',
  cards: [makeSupportingCard()],
});
const empty = makeThemeSupport({ key: 'tokens', label: 'Tokens', cards: [] });

describe('suggestion visibility', () => {
  it('visibleThemeSupport drops themes with zero supporting cards', () => {
    const suggestion = makeSuggestion({ themeSupport: [withCards, empty] });
    assert.deepStrictEqual(visibleThemeSupport(suggestion), [withCards]);
  });

  it('visibleKindredSupport drops kindred groups with zero supporting cards', () => {
    const suggestion = makeSuggestion({
      kindredSupport: [
        makeKindredSupport({ type: 'Goblin' }),
        makeKindredSupport({
          type: 'Elf',
          cards: [makeSupportingCard({ name: 'Fake Elf', quantity: 2 })],
        }),
      ],
    });
    assert.deepStrictEqual(
      visibleKindredSupport(suggestion).map((t) => t.type),
      ['Elf'],
    );
  });

  it('visibleThemeLabels/visibleKindredTypes only name the visible groups', () => {
    const suggestion = makeSuggestion({
      themeSupport: [withCards, empty],
      kindredSupport: [makeKindredSupport({ type: 'Goblin' })],
    });
    assert.deepStrictEqual(visibleThemeLabels(suggestion), ['Sacrifice']);
    assert.deepStrictEqual(visibleKindredTypes(suggestion), []);
  });

  it('a suggestion with only empty-card groups shows nothing', () => {
    const suggestion = makeSuggestion({
      themeSupport: [empty],
      kindredSupport: [makeKindredSupport({ type: 'Goblin' })],
    });
    assert.deepStrictEqual(visibleThemeSupport(suggestion), []);
    assert.deepStrictEqual(visibleKindredSupport(suggestion), []);
  });
});

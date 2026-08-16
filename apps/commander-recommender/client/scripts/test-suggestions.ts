/**
 * Tests for the "still has supporting cards" filter that keeps the card
 * display (and the filter bar's options) from showing a theme or kindred type the
 * server matched globally but that ended up with zero cards once narrowed
 * to this specific commander's color identity. Run with: npm test
 */
import assert from 'node:assert';
import {
  visibleThemeLabels,
  visibleThemeSupport,
  visibleKindredSupport,
  visibleKindredTypes,
} from '../src/lib/suggestions';
import { makeSuggestion, makeSupportingCard } from './fixtures';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

const withCards = { key: 'sacrifice', label: 'Sacrifice', description: '', cards: [makeSupportingCard()] };
const empty = { key: 'tokens', label: 'Tokens', description: '', cards: [] };

check('visibleThemeSupport drops themes with zero supporting cards', () => {
  const suggestion = makeSuggestion({ themeSupport: [withCards, empty] });
  assert.deepStrictEqual(visibleThemeSupport(suggestion), [withCards]);
});

check('visibleKindredSupport drops kindred groups with zero supporting cards', () => {
  const suggestion = makeSuggestion({
    kindredSupport: [
      { type: 'Goblin', cards: [] },
      { type: 'Elf', cards: [makeSupportingCard({ name: 'Fake Elf', quantity: 2 })] },
    ],
  });
  assert.deepStrictEqual(visibleKindredSupport(suggestion).map((t) => t.type), ['Elf']);
});

check('visibleThemeLabels/visibleKindredTypes only name the visible groups', () => {
  const suggestion = makeSuggestion({
    themeSupport: [withCards, empty],
    kindredSupport: [{ type: 'Goblin', cards: [] }],
  });
  assert.deepStrictEqual(visibleThemeLabels(suggestion), ['Sacrifice']);
  assert.deepStrictEqual(visibleKindredTypes(suggestion), []);
});

check('a suggestion with only empty-card groups shows nothing', () => {
  const suggestion = makeSuggestion({ themeSupport: [empty], kindredSupport: [{ type: 'Goblin', cards: [] }] });
  assert.deepStrictEqual(visibleThemeSupport(suggestion), []);
  assert.deepStrictEqual(visibleKindredSupport(suggestion), []);
});

if (failures > 0) {
  console.error(`\n${failures} suggestion-visibility cases failed.`);
  process.exit(1);
}
console.log('\nAll suggestion-visibility cases passed.');

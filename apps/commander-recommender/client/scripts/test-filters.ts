/**
 * Tests for the include/exclude filter facets: the off -> include -> exclude
 * -> off state machine, and how each facet applies to a suggestion list.
 * Run with: npm test
 */
import assert from 'node:assert';
import {
  applyFilters,
  availableFilterValues,
  cycleSelection,
  EMPTY_FILTERS,
  hasActiveFilters,
  modeOf,
  type FilterSelection,
} from '../src/lib/filters';
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

// --- state machine -----------------------------------------------------

check('cycleSelection goes off -> include -> exclude -> off', () => {
  let selection: FilterSelection = { include: [], exclude: [] };
  assert.strictEqual(modeOf(selection, 'W'), null);

  selection = cycleSelection(selection, 'W');
  assert.strictEqual(modeOf(selection, 'W'), 'include');

  selection = cycleSelection(selection, 'W');
  assert.strictEqual(modeOf(selection, 'W'), 'exclude');

  selection = cycleSelection(selection, 'W');
  assert.strictEqual(modeOf(selection, 'W'), null);
  assert.deepStrictEqual(selection, { include: [], exclude: [] });
});

check('cycleSelection leaves other values in the facet untouched', () => {
  const selection: FilterSelection = { include: ['U'], exclude: ['B'] };
  const next = cycleSelection(selection, 'W');
  assert.deepStrictEqual(next, { include: ['U', 'W'], exclude: ['B'] });
});

check('hasActiveFilters is false only when every facet is empty', () => {
  assert.strictEqual(hasActiveFilters(EMPTY_FILTERS), false);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, colors: { include: ['W'], exclude: [] } }), true);
  assert.strictEqual(hasActiveFilters({ ...EMPTY_FILTERS, themes: { include: [], exclude: ['Tokens'] } }), true);
  assert.strictEqual(
    hasActiveFilters({ ...EMPTY_FILTERS, colorCategory: { include: ['colorless'], exclude: [] } }),
    true
  );
});

// --- color filtering (subset-include, any-touch-exclude) --------------

check('color include keeps subsets of the selected colors, plus colorless', () => {
  const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
  const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
  const colorless = makeSuggestion({ colorIdentity: [] });
  const boros = makeSuggestion({ colorIdentity: ['W', 'R'] });

  const filters = { ...EMPTY_FILTERS, colors: { include: ['B', 'G'], exclude: [] } };
  const kept = applyFilters([golgari, monoBlack, colorless, boros], filters);
  assert.deepStrictEqual(kept, [golgari, monoBlack, colorless]);
});

check('color exclude drops anything touching an excluded color', () => {
  const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
  const mardu = makeSuggestion({ colorIdentity: ['W', 'B', 'R'] });
  const simic = makeSuggestion({ colorIdentity: ['U', 'G'] });

  const filters = { ...EMPTY_FILTERS, colors: { include: [], exclude: ['B'] } };
  const kept = applyFilters([golgari, mardu, simic], filters);
  assert.deepStrictEqual(kept, [simic]);
});

// --- color category (colorless / multicolor), same include/exclude cycle -

check('colorCategory include=colorless keeps only zero-color identities', () => {
  const colorless = makeSuggestion({ colorIdentity: [] });
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

  const filters = { ...EMPTY_FILTERS, colorCategory: { include: ['colorless'], exclude: [] } };
  assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [colorless]);
});

check('colorCategory include=multicolor keeps only 2+ color identities', () => {
  const colorless = makeSuggestion({ colorIdentity: [] });
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

  const filters = { ...EMPTY_FILTERS, colorCategory: { include: ['multicolor'], exclude: [] } };
  assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [multi]);
});

check('colorCategory exclude=colorless drops zero-color identities only', () => {
  const colorless = makeSuggestion({ colorIdentity: [] });
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

  const filters = { ...EMPTY_FILTERS, colorCategory: { include: [], exclude: ['colorless'] } };
  assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [mono, multi]);
});

check('colorCategory cycles the same off -> include -> exclude -> off as any other facet', () => {
  let selection: FilterSelection = { include: [], exclude: [] };
  assert.strictEqual(modeOf(selection, 'multicolor'), null);
  selection = cycleSelection(selection, 'multicolor');
  assert.strictEqual(modeOf(selection, 'multicolor'), 'include');
  selection = cycleSelection(selection, 'multicolor');
  assert.strictEqual(modeOf(selection, 'multicolor'), 'exclude');
});

// --- theme filtering (AND include, OR exclude, visible-only) -----------

const sac = { key: 'sacrifice', label: 'Sacrifice', description: '', cards: [makeSupportingCard({ name: 'A' })] };
const tokens = { key: 'tokens', label: 'Tokens', description: '', cards: [makeSupportingCard({ name: 'B' })] };
const emptyTheme = { key: 'graveyard', label: 'Graveyard', description: '', cards: [] };

check('theme include requires every selected theme to be present', () => {
  const both = makeSuggestion({ themeSupport: [sac, tokens] });
  const sacOnly = makeSuggestion({ themeSupport: [sac] });

  const filters = { ...EMPTY_FILTERS, themes: { include: ['Sacrifice', 'Tokens'], exclude: [] } };
  assert.deepStrictEqual(applyFilters([both, sacOnly], filters), [both]);
});

check('theme exclude drops a suggestion that has any excluded theme', () => {
  const withSac = makeSuggestion({ themeSupport: [sac] });
  const withTokens = makeSuggestion({ themeSupport: [tokens] });

  const filters = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['Sacrifice'] } };
  assert.deepStrictEqual(applyFilters([withSac, withTokens], filters), [withTokens]);
});

check('theme filtering only sees themes that still have supporting cards', () => {
  // "Graveyard" is matched by the server but has zero cards after identity
  // filtering — it should behave as if this suggestion doesn't have it.
  const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });

  const includeGraveyard = { ...EMPTY_FILTERS, themes: { include: ['Graveyard'], exclude: [] } };
  assert.deepStrictEqual(applyFilters([suggestion], includeGraveyard), []);

  const excludeGraveyard = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['Graveyard'] } };
  assert.deepStrictEqual(applyFilters([suggestion], excludeGraveyard), [suggestion]);
});

// --- bracket filtering ---------------------------------------------------

check('bracket include/exclude match on the bracket range', () => {
  const b1 = makeSuggestion({ bracket: { label: '', range: 'Bracket 1–2', note: '' } });
  const b3 = makeSuggestion({ bracket: { label: '', range: 'Bracket 3', note: '' } });

  const include = { ...EMPTY_FILTERS, brackets: { include: ['Bracket 3'], exclude: [] } };
  assert.deepStrictEqual(applyFilters([b1, b3], include), [b3]);

  const exclude = { ...EMPTY_FILTERS, brackets: { include: [], exclude: ['Bracket 3'] } };
  assert.deepStrictEqual(applyFilters([b1, b3], exclude), [b1]);
});

// --- available filter values ---------------------------------------------

check('availableFilterValues only offers themes that still have supporting cards', () => {
  const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });
  const { themes } = availableFilterValues([suggestion]);
  assert.deepStrictEqual(themes, ['Sacrifice']);
});

check('availableFilterValues flags colorless/multicolor presence', () => {
  const colorless = makeSuggestion({ colorIdentity: [] });
  const mono = makeSuggestion({ colorIdentity: ['B'] });
  const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

  assert.strictEqual(availableFilterValues([mono]).hasColorless, false);
  assert.strictEqual(availableFilterValues([mono]).hasMulticolor, false);
  assert.strictEqual(availableFilterValues([colorless]).hasColorless, true);
  assert.strictEqual(availableFilterValues([multi]).hasMulticolor, true);
});

if (failures > 0) {
  console.error(`\n${failures} filter cases failed.`);
  process.exit(1);
}
console.log('\nAll filter cases passed.');

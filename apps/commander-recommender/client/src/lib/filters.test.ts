/**
 * Tests for the include/exclude filter facets: the off -> include -> exclude
 * -> off state machine, and how each facet applies to a suggestion list.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  applyFilters,
  availableFilterValues,
  cycleSelection,
  EMPTY_FILTERS,
  hasActiveFilters,
  modeOf,
  type FilterSelection,
} from './filters';
import { makeSuggestion, makeSupportingCard } from '../test/fixtures';

describe('filters', () => {
  // --- state machine -----------------------------------------------------

  it('cycleSelection goes off -> include -> exclude -> off', () => {
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

  it('cycleSelection leaves other values in the facet untouched', () => {
    const selection: FilterSelection = { include: ['U'], exclude: ['B'] };
    const next = cycleSelection(selection, 'W');
    assert.deepStrictEqual(next, { include: ['U', 'W'], exclude: ['B'] });
  });

  it('hasActiveFilters is false only when every facet is empty', () => {
    assert.strictEqual(hasActiveFilters(EMPTY_FILTERS), false);
    assert.strictEqual(
      hasActiveFilters({ ...EMPTY_FILTERS, colors: { include: ['W'], exclude: [] } }),
      true,
    );
    assert.strictEqual(
      hasActiveFilters({ ...EMPTY_FILTERS, themes: { include: [], exclude: ['Tokens'] } }),
      true,
    );
    assert.strictEqual(
      hasActiveFilters({
        ...EMPTY_FILTERS,
        colorCategory: { include: ['colorless'], exclude: [] },
      }),
      true,
    );
  });

  // --- color filtering (any-touch-include, any-touch-exclude) -----------

  it('color include keeps anything touching an included color', () => {
    const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
    const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
    const wb = makeSuggestion({ colorIdentity: ['W', 'B'] });
    const boros = makeSuggestion({ colorIdentity: ['W', 'R'] });

    const filters = { ...EMPTY_FILTERS, colors: { include: ['B'], exclude: [] } };
    const kept = applyFilters([golgari, monoBlack, wb, boros], filters);
    assert.deepStrictEqual(kept, [golgari, monoBlack, wb]);
  });

  it('color include drops a colourless commander — it touches nothing', () => {
    const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
    const colorless = makeSuggestion({ colorIdentity: [] });

    const filters = { ...EMPTY_FILTERS, colors: { include: ['B'], exclude: [] } };
    const kept = applyFilters([monoBlack, colorless], filters);
    assert.deepStrictEqual(kept, [monoBlack]);
  });

  it('color exclude drops anything touching an excluded color', () => {
    const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
    const mardu = makeSuggestion({ colorIdentity: ['W', 'B', 'R'] });
    const simic = makeSuggestion({ colorIdentity: ['U', 'G'] });

    const filters = { ...EMPTY_FILTERS, colors: { include: [], exclude: ['B'] } };
    const kept = applyFilters([golgari, mardu, simic], filters);
    assert.deepStrictEqual(kept, [simic]);
  });

  // --- color category (colorless / multicolor), same include/exclude cycle -

  it('colorCategory include=colorless keeps only zero-color identities', () => {
    const colorless = makeSuggestion({ colorIdentity: [] });
    const mono = makeSuggestion({ colorIdentity: ['B'] });
    const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

    const filters = { ...EMPTY_FILTERS, colorCategory: { include: ['colorless'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [colorless]);
  });

  it('colorCategory include=multicolor keeps only 2+ color identities', () => {
    const colorless = makeSuggestion({ colorIdentity: [] });
    const mono = makeSuggestion({ colorIdentity: ['B'] });
    const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

    const filters = { ...EMPTY_FILTERS, colorCategory: { include: ['multicolor'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [multi]);
  });

  it('colorCategory exclude=colorless drops zero-color identities only', () => {
    const colorless = makeSuggestion({ colorIdentity: [] });
    const mono = makeSuggestion({ colorIdentity: ['B'] });
    const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

    const filters = { ...EMPTY_FILTERS, colorCategory: { include: [], exclude: ['colorless'] } };
    assert.deepStrictEqual(applyFilters([colorless, mono, multi], filters), [mono, multi]);
  });

  it('colorCategory cycles the same off -> include -> exclude -> off as any other facet', () => {
    let selection: FilterSelection = { include: [], exclude: [] };
    assert.strictEqual(modeOf(selection, 'multicolor'), null);
    selection = cycleSelection(selection, 'multicolor');
    assert.strictEqual(modeOf(selection, 'multicolor'), 'include');
    selection = cycleSelection(selection, 'multicolor');
    assert.strictEqual(modeOf(selection, 'multicolor'), 'exclude');
  });

  // --- theme filtering (AND include, OR exclude, visible-only) -----------

  const sac = {
    key: 'sacrifice',
    label: 'Sacrifice',
    description: '',
    cards: [makeSupportingCard({ name: 'A' })],
  };
  const tokens = {
    key: 'tokens',
    label: 'Tokens',
    description: '',
    cards: [makeSupportingCard({ name: 'B' })],
  };
  const emptyTheme = { key: 'graveyard', label: 'Graveyard', description: '', cards: [] };

  it('theme include requires every selected theme to be present', () => {
    const both = makeSuggestion({ themeSupport: [sac, tokens] });
    const sacOnly = makeSuggestion({ themeSupport: [sac] });

    const filters = { ...EMPTY_FILTERS, themes: { include: ['Sacrifice', 'Tokens'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([both, sacOnly], filters), [both]);
  });

  it('theme exclude drops a suggestion that has any excluded theme', () => {
    const withSac = makeSuggestion({ themeSupport: [sac] });
    const withTokens = makeSuggestion({ themeSupport: [tokens] });

    const filters = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['Sacrifice'] } };
    assert.deepStrictEqual(applyFilters([withSac, withTokens], filters), [withTokens]);
  });

  it('theme filtering only sees themes that still have supporting cards', () => {
    // "Graveyard" is matched by the server but has zero cards after identity
    // filtering — it should behave as if this suggestion doesn't have it.
    const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });

    const includeGraveyard = { ...EMPTY_FILTERS, themes: { include: ['Graveyard'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([suggestion], includeGraveyard), []);

    const excludeGraveyard = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['Graveyard'] } };
    assert.deepStrictEqual(applyFilters([suggestion], excludeGraveyard), [suggestion]);
  });

  // --- bracket filtering ---------------------------------------------------

  it('bracket include/exclude match on the bracket range', () => {
    const b1 = makeSuggestion({ bracket: { label: '', range: 'Bracket 1–2', note: '' } });
    const b3 = makeSuggestion({ bracket: { label: '', range: 'Bracket 3', note: '' } });

    const include = { ...EMPTY_FILTERS, brackets: { include: ['Bracket 3'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([b1, b3], include), [b3]);

    const exclude = { ...EMPTY_FILTERS, brackets: { include: [], exclude: ['Bracket 3'] } };
    assert.deepStrictEqual(applyFilters([b1, b3], exclude), [b1]);
  });

  // --- available filter values ---------------------------------------------

  it('availableFilterValues only offers themes that still have supporting cards', () => {
    const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });
    const { themes } = availableFilterValues([suggestion]);
    assert.deepStrictEqual(themes, ['Sacrifice']);
  });

  it('availableFilterValues flags colorless/multicolor presence', () => {
    const colorless = makeSuggestion({ colorIdentity: [] });
    const mono = makeSuggestion({ colorIdentity: ['B'] });
    const multi = makeSuggestion({ colorIdentity: ['B', 'G'] });

    assert.strictEqual(availableFilterValues([mono]).hasColorless, false);
    assert.strictEqual(availableFilterValues([mono]).hasMulticolor, false);
    assert.strictEqual(availableFilterValues([colorless]).hasColorless, true);
    assert.strictEqual(availableFilterValues([multi]).hasMulticolor, true);
  });
});

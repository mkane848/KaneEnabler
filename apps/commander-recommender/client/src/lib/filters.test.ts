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
import {
  makeKindredSupport,
  makeSuggestion,
  makeSupportingCard,
  makeThemeSupport,
} from '../test/fixtures';

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

  // --- color filtering (subset include, any-touch-exclude) --------------

  it('color include keeps only identities that fit inside the included colors', () => {
    const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
    const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
    const wb = makeSuggestion({ colorIdentity: ['W', 'B'] });
    const boros = makeSuggestion({ colorIdentity: ['W', 'R'] });

    const filters = { ...EMPTY_FILTERS, colors: { include: ['B'], exclude: [] } };
    const kept = applyFilters([golgari, monoBlack, wb, boros], filters);
    assert.deepStrictEqual(kept, [monoBlack]);
  });

  it('color include keeps a colourless commander — the empty identity is a subset of anything', () => {
    const monoBlack = makeSuggestion({ colorIdentity: ['B'] });
    const colorless = makeSuggestion({ colorIdentity: [] });

    const filters = { ...EMPTY_FILTERS, colors: { include: ['B'], exclude: [] } };
    const kept = applyFilters([monoBlack, colorless], filters);
    assert.deepStrictEqual(kept, [monoBlack, colorless]);
  });

  it('color exclude drops anything touching an excluded color', () => {
    const golgari = makeSuggestion({ colorIdentity: ['B', 'G'] });
    const mardu = makeSuggestion({ colorIdentity: ['W', 'B', 'R'] });
    const simic = makeSuggestion({ colorIdentity: ['U', 'G'] });

    const filters = { ...EMPTY_FILTERS, colors: { include: [], exclude: ['B'] } };
    const kept = applyFilters([golgari, mardu, simic], filters);
    assert.deepStrictEqual(kept, [simic]);
  });

  it('Abzan does not survive an R+G include', () => {
    const gruul = makeSuggestion({ colorIdentity: ['R', 'G'] });
    const monoRed = makeSuggestion({ colorIdentity: ['R'] });
    const monoGreen = makeSuggestion({ colorIdentity: ['G'] });
    const colorless = makeSuggestion({ colorIdentity: [] });
    const abzan = makeSuggestion({ colorIdentity: ['W', 'B', 'G'] });

    const filters = { ...EMPTY_FILTERS, colors: { include: ['R', 'G'], exclude: [] } };
    const kept = applyFilters([gruul, monoRed, monoGreen, colorless, abzan], filters);
    assert.deepStrictEqual(kept, [gruul, monoRed, monoGreen, colorless]);
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
  //
  // Filter *values* are archetype/qualifier keys ('sacrifice',
  // 'goWide:Sliver'), not display labels — see groupFacetOptions in
  // filters.ts. An unqualified theme's key and archetype are the same
  // string, so its own key doubles as "this archetype, unqualified".

  const sac = makeThemeSupport({
    key: 'sacrifice',
    label: 'Sacrifice',
    cards: [makeSupportingCard({ name: 'A' })],
  });
  const tokens = makeThemeSupport({
    key: 'tokens',
    label: 'Tokens',
    cards: [makeSupportingCard({ name: 'B' })],
  });
  const emptyTheme = makeThemeSupport({ key: 'graveyard', label: 'Graveyard', cards: [] });

  it('theme include requires every selected theme to be present', () => {
    const both = makeSuggestion({ themeSupport: [sac, tokens] });
    const sacOnly = makeSuggestion({ themeSupport: [sac] });

    const filters = { ...EMPTY_FILTERS, themes: { include: ['sacrifice', 'tokens'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([both, sacOnly], filters), [both]);
  });

  it('theme exclude drops a suggestion that has any excluded theme', () => {
    const withSac = makeSuggestion({ themeSupport: [sac] });
    const withTokens = makeSuggestion({ themeSupport: [tokens] });

    const filters = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['sacrifice'] } };
    assert.deepStrictEqual(applyFilters([withSac, withTokens], filters), [withTokens]);
  });

  it('theme filtering only sees themes that still have supporting cards', () => {
    // "Graveyard" is matched by the server but has zero cards after identity
    // filtering — it should behave as if this suggestion doesn't have it.
    const suggestion = makeSuggestion({ themeSupport: [sac, emptyTheme] });

    const includeGraveyard = { ...EMPTY_FILTERS, themes: { include: ['graveyard'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([suggestion], includeGraveyard), []);

    const excludeGraveyard = { ...EMPTY_FILTERS, themes: { include: [], exclude: ['graveyard'] } };
    assert.deepStrictEqual(applyFilters([suggestion], excludeGraveyard), [suggestion]);
  });

  // --- qualified themes (the "Go-Wide Combat (Dinosaur)" explosion) ------

  const goWideSliver = makeThemeSupport({
    key: 'goWide:Sliver',
    label: 'Go-Wide Combat (Sliver)',
    archetype: 'goWide',
    archetypeLabel: 'Go-Wide Combat',
    qualifier: 'Sliver',
    cards: [makeSupportingCard({ name: 'Sliver payoff' })],
  });
  const goWideGoblin = makeThemeSupport({
    key: 'goWide:Goblin',
    label: 'Go-Wide Combat (Goblin)',
    archetype: 'goWide',
    archetypeLabel: 'Go-Wide Combat',
    qualifier: 'Goblin',
    cards: [makeSupportingCard({ name: 'Goblin payoff' })],
  });

  it('selecting the base archetype value matches any qualifier, or none', () => {
    const sliverDeck = makeSuggestion({ themeSupport: [goWideSliver] });
    const goblinDeck = makeSuggestion({ themeSupport: [goWideGoblin] });
    const unrelated = makeSuggestion({ themeSupport: [sac] });

    const filters = { ...EMPTY_FILTERS, themes: { include: ['goWide'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([sliverDeck, goblinDeck, unrelated], filters), [
      sliverDeck,
      goblinDeck,
    ]);
  });

  it('selecting a narrowed qualifier value matches only that qualifier', () => {
    const sliverDeck = makeSuggestion({ themeSupport: [goWideSliver] });
    const goblinDeck = makeSuggestion({ themeSupport: [goWideGoblin] });

    const filters = { ...EMPTY_FILTERS, themes: { include: ['goWide:Sliver'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([sliverDeck, goblinDeck], filters), [sliverDeck]);
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
    const { themeFacets } = availableFilterValues([suggestion]);
    assert.deepStrictEqual(themeFacets, [
      { value: 'sacrifice', label: 'Sacrifice', qualifiers: [] },
    ]);
  });

  it('an archetype with only one qualifier present stays a single flat chip', () => {
    // Only Sliver shows up anywhere in this result set — nothing to narrow
    // between yet, so this should read exactly like an unqualified theme
    // rather than a base chip with a one-item disclosure under it.
    const suggestion = makeSuggestion({ themeSupport: [goWideSliver] });
    const { themeFacets } = availableFilterValues([suggestion]);
    assert.deepStrictEqual(themeFacets, [
      { value: 'goWide:Sliver', label: 'Go-Wide Combat (Sliver)', qualifiers: [] },
    ]);
  });

  it('an archetype with 2+ qualifiers present groups into one base chip with a narrowed list', () => {
    // The screenshot bug this exists for: a broad result set turning up
    // "Go-Wide Combat (Dinosaur)", "(Dragon)", "(Dwarf)", ... as one flat
    // wall of chips. Once 2+ tribes are actually present, they collapse
    // into one "Go-Wide Combat" base chip plus a narrowed qualifier list.
    const sliverDeck = makeSuggestion({ themeSupport: [goWideSliver] });
    const goblinDeck = makeSuggestion({ themeSupport: [goWideGoblin] });
    const { themeFacets } = availableFilterValues([sliverDeck, goblinDeck]);
    assert.deepStrictEqual(themeFacets, [
      {
        value: 'goWide',
        label: 'Go-Wide Combat',
        qualifiers: [
          { value: 'goWide:Goblin', label: 'Goblin' },
          { value: 'goWide:Sliver', label: 'Sliver' },
        ],
      },
    ]);
  });

  // --- kindred filtering — same grouped shape, its own suggestion field --

  it('kindred include/exclude and grouping mirror themes, off kindredSupport', () => {
    const sliverDeck = makeSuggestion({
      kindredSupport: [
        makeKindredSupport({
          type: 'Sliver',
          cards: [makeSupportingCard({ name: 'Sliver Overlord' })],
        }),
      ],
    });
    const goblinDeck = makeSuggestion({
      kindredSupport: [
        makeKindredSupport({
          type: 'Goblin',
          cards: [makeSupportingCard({ name: 'Goblin Chieftain' })],
        }),
      ],
    });

    const { kindredFacets } = availableFilterValues([sliverDeck, goblinDeck]);
    assert.deepStrictEqual(kindredFacets, [
      {
        value: 'kindred',
        label: 'Kindred',
        qualifiers: [
          { value: 'kindred:Goblin', label: 'Goblin' },
          { value: 'kindred:Sliver', label: 'Sliver' },
        ],
      },
    ]);

    const anyKindred = { ...EMPTY_FILTERS, kindred: { include: ['kindred'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([sliverDeck, goblinDeck], anyKindred), [
      sliverDeck,
      goblinDeck,
    ]);

    const sliverOnly = { ...EMPTY_FILTERS, kindred: { include: ['kindred:Sliver'], exclude: [] } };
    assert.deepStrictEqual(applyFilters([sliverDeck, goblinDeck], sliverOnly), [sliverDeck]);
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

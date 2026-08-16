import type { CommanderSuggestionDTO } from '../types';
import { visibleThemeLabels } from './suggestions';

/** A facet's selection: values the user wants to require, and values they
 * want to rule out. A value never appears in both at once. */
export interface FilterSelection {
  include: string[];
  exclude: string[];
}

export type FilterMode = 'include' | 'exclude';

export interface SuggestionFilters {
  colors: FilterSelection;
  /**
   * A further, independent restriction by identity *size* rather than
   * membership: colorless (identity is empty) or multicolor (2+ colors).
   * Kept as its own facet rather than folded into `colors` — "must be a
   * subset of {B, G}" and "must have 2+ colors" are different kinds of
   * question — but its values ('colorless' | 'multicolor') use the same
   * include/exclude cycle as every other facet, and render as chips inside
   * the same "Colors" filter row.
   */
  colorCategory: FilterSelection;
  brackets: FilterSelection;
  themes: FilterSelection;
}

const EMPTY_SELECTION: FilterSelection = { include: [], exclude: [] };

export const EMPTY_FILTERS: SuggestionFilters = {
  colors: EMPTY_SELECTION,
  colorCategory: EMPTY_SELECTION,
  brackets: EMPTY_SELECTION,
  themes: EMPTY_SELECTION,
};

export function hasActiveFilters(filters: SuggestionFilters): boolean {
  return (Object.values(filters) as FilterSelection[]).some(
    (selection) => selection.include.length > 0 || selection.exclude.length > 0
  );
}

/** Where a value currently sits in a facet: required, ruled out, or neither. */
export function modeOf(selection: FilterSelection, value: string): FilterMode | null {
  if (selection.include.includes(value)) return 'include';
  if (selection.exclude.includes(value)) return 'exclude';
  return null;
}

/** Cycles a single value through off → include → exclude → off. */
export function cycleSelection(selection: FilterSelection, value: string): FilterSelection {
  const mode = modeOf(selection, value);
  const include = selection.include.filter((v) => v !== value);
  const exclude = selection.exclude.filter((v) => v !== value);

  if (mode === null) return { include: [...include, value], exclude };
  if (mode === 'include') return { include, exclude: [...exclude, value] };
  return { include, exclude };
}

/**
 * Color filtering keeps subset semantics for "include": picking {B, G}
 * keeps everything playable in a Golgari deck — mono-black, mono-green,
 * Golgari, and colorless — rather than only things that touch both colors.
 * "Exclude" is the literal complement: identities that touch an excluded
 * color at all are dropped, regardless of what else they contain.
 */
function matchesColors(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length > 0) {
    const allowed = new Set(include);
    if (!suggestion.colorIdentity.every((color) => allowed.has(color))) return false;
  }
  if (exclude.length > 0) {
    const excluded = new Set(exclude);
    if (suggestion.colorIdentity.some((color) => excluded.has(color))) return false;
  }
  return true;
}

/**
 * `colorCategory` matches on identity *size* rather than membership, so
 * each value is checked as its own boolean rather than set membership.
 * Selecting both 'colorless' and 'multicolor' as "include" is a legal but
 * self-defeating combination (nothing is both) — that falls out of the
 * same AND semantics every other include facet already uses, rather than
 * needing special-casing here.
 */
function matchesColorCategory(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length === 0 && exclude.length === 0) return true;
  const isColorless = suggestion.colorIdentity.length === 0;
  const isMulticolor = suggestion.colorIdentity.length >= 2;
  const satisfies = (value: string) => (value === 'colorless' ? isColorless : isMulticolor);
  if (include.length > 0 && !include.every(satisfies)) return false;
  if (exclude.length > 0 && exclude.some(satisfies)) return false;
  return true;
}

/** Included themes are AND-ed (must have all); excluded themes are ruled out
 * if the suggestion has any of them. Matched against the same "still has
 * supporting cards after the identity filter" set the card display uses, so
 * a filter chip never claims a theme that suggestion isn't actually showing
 * as a reason. */
function matchesThemes(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length === 0 && exclude.length === 0) return true;
  const present = new Set(visibleThemeLabels(suggestion));
  if (include.length > 0 && !include.every((theme) => present.has(theme))) return false;
  if (exclude.length > 0 && exclude.some((theme) => present.has(theme))) return false;
  return true;
}

function matchesBracket(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length > 0 && !include.includes(suggestion.bracket.range)) return false;
  if (exclude.length > 0 && exclude.includes(suggestion.bracket.range)) return false;
  return true;
}

export function applyFilters(
  suggestions: CommanderSuggestionDTO[],
  filters: SuggestionFilters
): CommanderSuggestionDTO[] {
  return suggestions.filter(
    (s) =>
      matchesColors(s, filters.colors) &&
      matchesColorCategory(s, filters.colorCategory) &&
      matchesBracket(s, filters.brackets) &&
      matchesThemes(s, filters.themes)
  );
}

/**
 * The filter values worth offering, taken from the results themselves — no
 * point showing a Bracket 4–5 toggle when nothing in the list is Bracket 4–5.
 * Themes are drawn from the same "still has supporting cards" set the card
 * display uses, so a filter chip never offers a theme no suggestion actually
 * shows.
 */
export function availableFilterValues(suggestions: CommanderSuggestionDTO[]) {
  const brackets = new Set<string>();
  const themes = new Set<string>();
  const colors = new Set<string>();
  let hasColorless = false;
  let hasMulticolor = false;

  for (const suggestion of suggestions) {
    brackets.add(suggestion.bracket.range);
    visibleThemeLabels(suggestion).forEach((theme) => themes.add(theme));
    suggestion.colorIdentity.forEach((color) => colors.add(color));
    if (suggestion.colorIdentity.length === 0) hasColorless = true;
    if (suggestion.colorIdentity.length >= 2) hasMulticolor = true;
  }

  return {
    brackets: [...brackets].sort(),
    themes: [...themes].sort(),
    colors,
    hasColorless,
    hasMulticolor,
  };
}

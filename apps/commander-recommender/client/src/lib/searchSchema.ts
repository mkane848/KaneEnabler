import { EMPTY_FILTERS, type FilterSelection, type SuggestionFilters } from './filters';
import type { SortDirection, SortMode } from './sort';

export interface RecommenderSearch {
  filters: SuggestionFilters;
  sortMode: SortMode;
  sortDirection: SortDirection;
}

/** The single source of truth for "nothing customized yet" — also what
 * router.tsx strips from the URL, so a bare visit stays a bare `/`. */
export const DEFAULT_RECOMMENDER_SEARCH: RecommenderSearch = {
  filters: EMPTY_FILTERS,
  sortMode: 'relevance',
  sortDirection: 'desc',
};

const SORT_MODES: readonly SortMode[] = ['relevance', 'colorNameValue'];
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseFilterSelection(value: unknown): FilterSelection {
  if (typeof value !== 'object' || value === null) return { include: [], exclude: [] };
  const raw = value as Record<string, unknown>;
  return {
    include: isStringArray(raw.include) ? raw.include : [],
    exclude: isStringArray(raw.exclude) ? raw.exclude : [],
  };
}

function parseFilters(value: unknown): SuggestionFilters {
  if (typeof value !== 'object' || value === null) return EMPTY_FILTERS;
  const raw = value as Record<string, unknown>;
  return {
    colors: parseFilterSelection(raw.colors),
    colorCategory: parseFilterSelection(raw.colorCategory),
    brackets: parseFilterSelection(raw.brackets),
    themes: parseFilterSelection(raw.themes),
  };
}

/**
 * The URL is untrusted input — hand-edited, an old bookmark from before a
 * shape change, or just mistyped — so every field falls back to the same
 * default the old component state used rather than throwing. Filter values
 * themselves (theme labels, bracket ranges) are deliberately *not* checked
 * against a fixed vocabulary here: which values are valid depends on the
 * submitted list, not the URL, and a stale/nonsensical one simply matches
 * nothing rather than needing to be rejected.
 */
export function validateRecommenderSearch(search: Record<string, unknown>): RecommenderSearch {
  const sortMode = SORT_MODES.includes(search.sortMode as SortMode)
    ? (search.sortMode as SortMode)
    : DEFAULT_RECOMMENDER_SEARCH.sortMode;
  const sortDirection = SORT_DIRECTIONS.includes(search.sortDirection as SortDirection)
    ? (search.sortDirection as SortDirection)
    : DEFAULT_RECOMMENDER_SEARCH.sortDirection;

  return {
    filters: parseFilters(search.filters),
    sortMode,
    sortDirection,
  };
}

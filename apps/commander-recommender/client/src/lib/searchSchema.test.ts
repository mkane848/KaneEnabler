import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import { validateRecommenderSearch } from './searchSchema';

describe('validateRecommenderSearch', () => {
  it('defaults everything on an empty search (a fresh visit)', () => {
    expect(validateRecommenderSearch({})).toEqual({
      filters: EMPTY_FILTERS,
      sortMode: 'relevance',
      sortDirection: 'desc',
    });
  });

  it('round-trips a fully populated, well-formed search', () => {
    const search = {
      filters: {
        colors: { include: ['W', 'U'], exclude: [] },
        colorCategory: { include: [], exclude: ['colorless'] },
        brackets: { include: ['3'], exclude: [] },
        themes: { include: [], exclude: [] },
      },
      sortMode: 'colorNameValue',
      sortDirection: 'asc',
    };
    expect(validateRecommenderSearch(search)).toEqual(search);
  });

  it('falls back to defaults for an unrecognized sortMode instead of throwing', () => {
    expect(validateRecommenderSearch({ sortMode: 'shuffle' }).sortMode).toBe('relevance');
  });

  it('falls back to defaults for an unrecognized sortDirection', () => {
    expect(validateRecommenderSearch({ sortDirection: 'sideways' }).sortDirection).toBe('desc');
  });

  it('falls back a whole filter selection to empty if any entry is malformed', () => {
    const result = validateRecommenderSearch({
      filters: { colors: { include: ['W', 42, null], exclude: 'not-an-array' } },
    });
    expect(result.filters.colors).toEqual({ include: [], exclude: [] });
  });

  it('fills in missing filter facets rather than dropping the whole filters object', () => {
    const result = validateRecommenderSearch({
      filters: { colors: { include: ['G'], exclude: [] } },
    });
    expect(result.filters).toEqual({
      colors: { include: ['G'], exclude: [] },
      colorCategory: { include: [], exclude: [] },
      brackets: { include: [], exclude: [] },
      themes: { include: [], exclude: [] },
    });
  });

  it('treats a non-object filters value (e.g. a stray string) as empty', () => {
    expect(validateRecommenderSearch({ filters: 'oops' }).filters).toEqual(EMPTY_FILTERS);
  });
});

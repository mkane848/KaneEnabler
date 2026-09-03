import { describe, expect, it } from 'vitest';
import type { CardPreference } from '@mtg/profile';
import { isDislikedUnit, partitionDisliked } from './disliked';
import type { CommanderSuggestionDTO } from '../types';

function preference(oracleId: string, sentiment: 'like' | 'dislike'): CardPreference {
  return {
    id: `pref-${oracleId}`,
    userId: 'user-1',
    oracleId,
    sentiment,
    tags: [],
    note: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function index(...preferences: CardPreference[]): Map<string, CardPreference> {
  return new Map(preferences.map((p) => [p.oracleId, p]));
}

function suggestion(unitId: string, oracleIds: string[]): CommanderSuggestionDTO {
  return {
    unitId,
    cards: oracleIds.map((oracleId) => ({ oracleId, name: oracleId })),
  } as unknown as CommanderSuggestionDTO;
}

describe('isDislikedUnit', () => {
  it('is true for a single disliked commander', () => {
    expect(isDislikedUnit(suggestion('a', ['o1']), index(preference('o1', 'dislike')))).toBe(true);
  });

  it('is false for a liked or unmarked commander', () => {
    expect(isDislikedUnit(suggestion('a', ['o1']), index(preference('o1', 'like')))).toBe(false);
    expect(isDislikedUnit(suggestion('a', ['o1']), index())).toBe(false);
  });

  // Matches LikeDislikeButtons' "unit agrees" rule: a split pair reads as
  // neither there, so it must not silently vanish from the grid here.
  it('is true for a pair only when both halves are disliked', () => {
    const both = index(preference('o1', 'dislike'), preference('o2', 'dislike'));
    const split = index(preference('o1', 'dislike'));
    expect(isDislikedUnit(suggestion('a', ['o1', 'o2']), both)).toBe(true);
    expect(isDislikedUnit(suggestion('a', ['o1', 'o2']), split)).toBe(false);
  });

  it('is false for an empty unit, which .every would otherwise call disliked', () => {
    expect(isDislikedUnit(suggestion('a', []), index())).toBe(false);
  });

  it('hides nothing when signed out, where the index is empty', () => {
    const suggestions = [suggestion('a', ['o1']), suggestion('b', ['o2'])];
    expect(partitionDisliked(suggestions, new Map()).hidden).toHaveLength(0);
  });
});

describe('partitionDisliked', () => {
  it('splits suggestions while preserving order within each side', () => {
    const suggestions = [
      suggestion('a', ['o1']),
      suggestion('b', ['o2']),
      suggestion('c', ['o3']),
      suggestion('d', ['o4']),
    ];
    const { shown, hidden } = partitionDisliked(
      suggestions,
      index(preference('o2', 'dislike'), preference('o4', 'dislike')),
    );
    expect(shown.map((s) => s.unitId)).toEqual(['a', 'c']);
    expect(hidden.map((s) => s.unitId)).toEqual(['b', 'd']);
  });

  it('returns everything as shown when nothing is disliked', () => {
    const suggestions = [suggestion('a', ['o1']), suggestion('b', ['o2'])];
    const { shown, hidden } = partitionDisliked(suggestions, index(preference('o1', 'like')));
    expect(shown).toHaveLength(2);
    expect(hidden).toHaveLength(0);
  });
});

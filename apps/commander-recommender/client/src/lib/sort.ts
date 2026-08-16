import { COLOR_ORDER, sortWubrg } from './mtg';
import type { CommanderSuggestionDTO } from '../types';

export type SortMode = 'relevance' | 'colorNameValue';

export const SORT_MODE_LABELS: Record<SortMode, string> = {
  relevance: 'Best match',
  colorNameValue: 'Colors, name, mana value',
};

/**
 * Compares two color identities of equal length in WUBRG order: mono-White
 * before mono-Blue, WU before WB before UB, and so on — the same priority
 * order `sortWubrg` already uses to arrange pips, applied here to arrange
 * whole identities against each other.
 */
function compareIdentity(a: string[], b: string[]): number {
  const sortedA = sortWubrg(a);
  const sortedB = sortWubrg(b);
  for (let i = 0; i < sortedA.length; i++) {
    const rankA = COLOR_ORDER.get(sortedA[i]) ?? 99;
    const rankB = COLOR_ORDER.get(sortedB[i]) ?? 99;
    if (rankA !== rankB) return rankA - rankB;
  }
  return 0;
}

/** A unit's display name — one card's name, or both joined for a pair. */
function unitName(suggestion: CommanderSuggestionDTO): string {
  return suggestion.cards.map((c) => c.name).join(' + ');
}

/** A unit's total mana value — both halves' cost, for a Partner pair. */
function unitManaValue(suggestion: CommanderSuggestionDTO): number {
  return suggestion.cards.reduce((sum, c) => sum + (c.manaValue ?? 0), 0);
}

/**
 * Fewest colors first, WUBRG order within a color count, then commander
 * name, then mana value as a last-resort tiebreaker (names are unique, so it
 * rarely comes into play — it's there for the rare case Scryfall has two
 * printings sharing a name resolve to the same oracle card either way).
 */
function compareByColorNameValue(a: CommanderSuggestionDTO, b: CommanderSuggestionDTO): number {
  if (a.colorIdentity.length !== b.colorIdentity.length) {
    return a.colorIdentity.length - b.colorIdentity.length;
  }
  const identityCmp = compareIdentity(a.colorIdentity, b.colorIdentity);
  if (identityCmp !== 0) return identityCmp;

  const nameCmp = unitName(a).localeCompare(unitName(b));
  if (nameCmp !== 0) return nameCmp;

  return unitManaValue(a) - unitManaValue(b);
}

export type SortDirection = 'asc' | 'desc';

/**
 * What each mode's "natural" order already is, so a direction can be applied
 * on top of it without each call site having to know. `relevance` arrives
 * from the server highest-score-first (descending); `colorNameValue` sorts
 * fewest colors / A-Z / cheapest first (ascending).
 */
const NATURAL_DIRECTION: Record<SortMode, SortDirection> = {
  relevance: 'desc',
  colorNameValue: 'asc',
};

/**
 * `relevance` in its natural direction is a no-op: suggestions already arrive
 * from the server ordered by score, and re-sorting a fresh array copy here
 * would just be wasted work on every render. Reversing it still only costs a
 * copy, never a comparison.
 */
export function sortSuggestions(
  suggestions: CommanderSuggestionDTO[],
  mode: SortMode,
  direction: SortDirection = NATURAL_DIRECTION[mode]
): CommanderSuggestionDTO[] {
  const reversed = direction !== NATURAL_DIRECTION[mode];

  if (mode === 'relevance') {
    return reversed ? [...suggestions].reverse() : suggestions;
  }

  const sorted = [...suggestions].sort(compareByColorNameValue);
  return reversed ? sorted.reverse() : sorted;
}

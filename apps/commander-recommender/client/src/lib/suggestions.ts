import type { CommanderSuggestionDTO, KeywordSupportDTO, ThemeSupportDTO, KindredSupportDTO } from '../types';

/**
 * A theme or kindred type can be "matched" against the collection as a whole, but
 * once support cards are filtered down to ones that actually fit this
 * specific commander's color identity, none may be left — e.g. the list has
 * two Goblins, but they're red and this commander is mono-blue. That isn't a
 * real reason to suggest the commander, so it shouldn't be shown as one.
 *
 * These helpers are the single place that applies that "still has cards"
 * filter, so the card display and the filter bar (which derives its options
 * from the same data) can't drift out of sync with each other.
 */

export function visibleThemeSupport(suggestion: CommanderSuggestionDTO): ThemeSupportDTO[] {
  return suggestion.themeSupport.filter((theme) => theme.cards.length > 0);
}

export function visibleKindredSupport(suggestion: CommanderSuggestionDTO): KindredSupportDTO[] {
  return suggestion.kindredSupport.filter((kindred) => kindred.cards.length > 0);
}

export function visibleThemeLabels(suggestion: CommanderSuggestionDTO): string[] {
  return visibleThemeSupport(suggestion).map((theme) => theme.label);
}

export function visibleKindredTypes(suggestion: CommanderSuggestionDTO): string[] {
  return visibleKindredSupport(suggestion).map((kindred) => kindred.type);
}

// Keywords have the same "matched globally, empty once filtered to this
// commander's color identity" problem as themes and kindred above — there's
// no equivalent on main, since its synergy scoring dropped keyword support.
export function visibleKeywordSupport(suggestion: CommanderSuggestionDTO): KeywordSupportDTO[] {
  return suggestion.keywordSupport.filter((keyword) => keyword.cards.length > 0);
}

export function visibleKeywordLabels(suggestion: CommanderSuggestionDTO): string[] {
  return visibleKeywordSupport(suggestion).map((keyword) => keyword.keyword);
}

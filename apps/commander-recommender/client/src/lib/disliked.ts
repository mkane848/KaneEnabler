import type { CardPreference } from '@mtg/profile';
import type { CommanderSuggestionDTO } from '../types';

/**
 * Whether a suggestion counts as disliked, given the signed-in user's card
 * preferences.
 *
 * A Partner/Background pair is one suggestion but two cards, and it only
 * counts as disliked when *every* card in it is — the same "unit agrees"
 * rule `LikeDislikeButtons` uses to decide whether to light the ✕ up. A
 * pair with one half disliked reads as neither there, so it must not
 * silently vanish from the grid here.
 *
 * An empty unit can't be disliked; `.every` on an empty array is `true`,
 * which would hide it.
 */
export function isDislikedUnit(
  suggestion: CommanderSuggestionDTO,
  byOracleId: Map<string, CardPreference>,
): boolean {
  if (suggestion.cards.length === 0) return false;
  return suggestion.cards.every((card) => byOracleId.get(card.oracleId)?.sentiment === 'dislike');
}

/**
 * Splits suggestions into the ones to show and the ones a persistent
 * dislike hides.
 *
 * This is the one behavior a dislike has beyond annotation. It stays on the
 * filter side of Phase 7's "preferences filter and annotate only — no
 * scoring change" decision (docs/handoff.md): the server's ranking is
 * untouched, and nothing is dropped irrecoverably — the caller shows a
 * count and a way back, exactly like a session dismissal.
 */
export function partitionDisliked(
  suggestions: CommanderSuggestionDTO[],
  byOracleId: Map<string, CardPreference>,
): { shown: CommanderSuggestionDTO[]; hidden: CommanderSuggestionDTO[] } {
  const shown: CommanderSuggestionDTO[] = [];
  const hidden: CommanderSuggestionDTO[] = [];
  for (const suggestion of suggestions) {
    (isDislikedUnit(suggestion, byOracleId) ? hidden : shown).push(suggestion);
  }
  return { shown, hidden };
}

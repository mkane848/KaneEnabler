import {
  comboKey,
  useAuth,
  useComboPreferencesIndex,
  useRemoveComboPreference,
  useSetComboPreference,
} from '@mtg/profile';
import type { Sentiment } from '@mtg/profile';
import type { ComboDTO } from '../types';

/**
 * Stores a snapshot of the combo as shown (cards/produces/description/
 * permalink), never re-fetched from Commander Spellbook just to render a
 * favourites list later — docs/handoff.md's Phase 7 and api-policy.md both
 * require that. Hidden entirely when signed out, matching
 * LikeDislikeButtons.
 */
export function ComboFavoriteButton({ combo }: { combo: ComboDTO }) {
  const { user } = useAuth();
  const key = comboKey(combo.cards);
  const comboIndex = useComboPreferencesIndex();
  const setPreference = useSetComboPreference();
  const removePreference = useRemoveComboPreference();

  if (!user) return null;

  const current = comboIndex.get(key)?.sentiment ?? null;

  function toggle(sentiment: Sentiment) {
    if (!user) return;
    if (current === sentiment) {
      removePreference.mutate({ userId: user.id, comboKey: key });
      return;
    }
    setPreference.mutate({
      userId: user.id,
      input: {
        comboKey: key,
        sentiment,
        spellbookId: combo.id ?? undefined,
        snapshot: combo,
      },
    });
  }

  return (
    <span className="like-dislike-row combo-favorite-row">
      <button
        type="button"
        className={`like-dislike-btn${current === 'like' ? ' is-liked' : ''}`}
        aria-pressed={current === 'like'}
        aria-label={current === 'like' ? 'Remove from favourites' : 'Favourite this combo'}
        onClick={() => toggle('like')}
      >
        ♥
      </button>
      <button
        type="button"
        className={`like-dislike-btn${current === 'dislike' ? ' is-disliked' : ''}`}
        aria-pressed={current === 'dislike'}
        aria-label={current === 'dislike' ? 'Remove from hated combos' : 'Mark as a combo you hate'}
        onClick={() => toggle('dislike')}
      >
        ✕
      </button>
    </span>
  );
}

import {
  useAuth,
  useCardPreferencesIndex,
  useRemoveCardPreferences,
  useSetCardPreferences,
} from '@mtg/profile';
import type { Sentiment } from '@mtg/profile';

/**
 * Filter-and-annotate only (docs/handoff.md's Phase 7) — this never touches
 * score or ranking, only shows what you've already marked. Hidden entirely
 * when signed out rather than prompting to sign in from here: liking a
 * suggestion isn't the primary thing this app does, and a nag on every card
 * would compete with it.
 *
 * A pair (Partner/Background) is liked or disliked as one unit — both
 * cards' oracleIds get the same sentiment together, since that's how the
 * suggestion itself is presented and dismissed.
 */
export function LikeDislikeButtons({ oracleIds }: { oracleIds: string[] }) {
  const { user } = useAuth();
  const byOracleId = useCardPreferencesIndex();
  const setPreferences = useSetCardPreferences();
  const removePreferences = useRemoveCardPreferences();

  if (!user) return null;

  const sentiments = oracleIds.map((id) => byOracleId.get(id)?.sentiment);
  // Only shown as active when every card in the unit agrees — a pair split
  // between like and dislike (e.g. after only one half was ever tagged)
  // reads as neither rather than picking one side silently.
  const current: Sentiment | null = sentiments.every((s) => s === 'like')
    ? 'like'
    : sentiments.every((s) => s === 'dislike')
      ? 'dislike'
      : null;

  function toggle(sentiment: Sentiment) {
    if (!user) return;
    if (current === sentiment) {
      removePreferences.mutate({ userId: user.id, oracleIds });
      return;
    }
    setPreferences.mutate({
      userId: user.id,
      inputs: oracleIds.map((oracleId) => ({ oracleId, sentiment })),
    });
  }

  return (
    <div className="like-dislike-row">
      <button
        type="button"
        className={`like-dislike-btn${current === 'like' ? ' is-liked' : ''}`}
        aria-pressed={current === 'like'}
        aria-label={current === 'like' ? 'Remove like' : 'Like this commander'}
        onClick={() => toggle('like')}
      >
        ♥
      </button>
      <button
        type="button"
        className={`like-dislike-btn${current === 'dislike' ? ' is-disliked' : ''}`}
        aria-pressed={current === 'dislike'}
        aria-label={current === 'dislike' ? 'Remove dislike' : 'Dislike this commander'}
        onClick={() => toggle('dislike')}
      >
        ✕
      </button>
    </div>
  );
}

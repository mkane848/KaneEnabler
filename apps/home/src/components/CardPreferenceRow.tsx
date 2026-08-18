import { useState } from 'react';
import { useSetCardPreference, useRemoveCardPreference } from '@mtg/profile';
import type { CardPreference } from '@mtg/profile';
import type { ResolvedCard } from '../api/cards';

interface Props {
  userId: string;
  preference: CardPreference;
  /** Undefined while the batch lookup is still loading, or if the oracle_id no longer resolves. */
  card: ResolvedCard | undefined;
}

/**
 * One row in the profile's liked/disliked cards list — the "browse page"
 * docs/handoff.md's Phase 7 scoped out of v1 and deferred, now a consumer
 * of the same useCardPreferences/useSetCardPreference hooks the
 * recommender's own like/dislike/jank UI already uses. Jank toggling
 * preserves the row's other tags, matching CardDetailDialog's JankToggle;
 * the note field is new here — the schema always had it, but no UI ever
 * exposed it for editing before this page.
 */
export function CardPreferenceRow({ userId, preference, card }: Props) {
  const setPreference = useSetCardPreference();
  const removePreference = useRemoveCardPreference();
  const [note, setNote] = useState(preference.note ?? '');
  const isJank = preference.tags.includes('jank');

  function toggleJank() {
    const tags = isJank
      ? preference.tags.filter((tag) => tag !== 'jank')
      : [...preference.tags, 'jank'];
    setPreference.mutate({
      userId,
      input: {
        oracleId: preference.oracleId,
        sentiment: preference.sentiment,
        tags,
        note: preference.note ?? undefined,
      },
    });
  }

  function saveNote() {
    if (note === (preference.note ?? '')) return;
    setPreference.mutate({
      userId,
      input: {
        oracleId: preference.oracleId,
        sentiment: preference.sentiment,
        tags: preference.tags,
        note: note === '' ? null : note,
      },
    });
  }

  return (
    <li className="profile-card-row">
      {card?.imageUri && <img className="profile-card-thumb" src={card.imageUri} alt="" />}
      <div className="profile-card-body">
        <div className="profile-card-heading">
          <span className="profile-card-name">{card?.name ?? preference.oracleId}</span>
          {card?.isCommanderEligible && <span className="profile-card-badge">Commander</span>}
        </div>

        {preference.sentiment === 'like' && (
          <button
            type="button"
            className={`profile-jank-toggle${isJank ? ' is-active' : ''}`}
            aria-pressed={isJank}
            onClick={toggleJank}
          >
            {isJank ? '★ Favourite jank card' : 'Mark as favourite jank card'}
          </button>
        )}

        <textarea
          className="profile-note-input"
          placeholder="Add a note…"
          aria-label={`Note for ${card?.name ?? preference.oracleId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
        />

        <button
          type="button"
          className="profile-remove"
          onClick={() => removePreference.mutate({ userId, oracleId: preference.oracleId })}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

import { useRemoveComboPreference } from '@mtg/profile';
import type { ComboPreference } from '@mtg/profile';

/**
 * The shape ComboFavoriteButton (commander-recommender/client) writes to
 * `snapshot` at favourite time — combo_preferences.snapshot is untyped
 * (jsonb) at rest, so this is read defensively rather than trusted whole.
 */
interface ComboSnapshot {
  permalink?: string | null;
  cards?: string[];
  produces?: string[];
  description?: string | null;
}

/**
 * One row in the profile's favourite/hated combos list, rendered straight
 * from the stored snapshot — never a live Commander Spellbook call, per
 * docs/api-policy.md's regression guard (see ComboFavoriteButton.test.tsx).
 */
export function ComboPreferenceRow({
  userId,
  preference,
}: {
  userId: string;
  preference: ComboPreference;
}) {
  const removePreference = useRemoveComboPreference();
  const snapshot = (preference.snapshot ?? {}) as ComboSnapshot;
  const cards = snapshot.cards ?? [];
  const produces = snapshot.produces ?? [];

  return (
    <li className="profile-combo-row">
      <div className="profile-combo-cards">
        {cards.length > 0 ? cards.join(' + ') : 'Unknown combo'}
      </div>
      {produces.length > 0 && <div className="profile-combo-produces">{produces.join(', ')}</div>}
      {snapshot.description && <p className="profile-combo-description">{snapshot.description}</p>}
      {snapshot.permalink && (
        <a
          className="profile-combo-link"
          href={snapshot.permalink}
          target="_blank"
          rel="noreferrer"
        >
          View on Commander Spellbook →
        </a>
      )}
      <button
        type="button"
        className="profile-remove"
        onClick={() => removePreference.mutate({ userId, comboKey: preference.comboKey })}
      >
        Remove
      </button>
    </li>
  );
}

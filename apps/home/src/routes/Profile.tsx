import { useMemo, useState } from 'react';
import { useAuth, useCardPreferences, useComboPreferences, AuthDialog } from '@mtg/profile';
import { useResolvedCards } from '../hooks/useResolvedCards';
import type { ResolvedCard } from '../api/cards';
import { CardPreferenceRow } from '../components/CardPreferenceRow';
import { ComboPreferenceRow } from '../components/ComboPreferenceRow';

/**
 * The deferred "profile/browse page" from docs/handoff.md's Phase 7 — the
 * seven requested lists (liked/disliked cards, favourite jank cards,
 * favourite/disliked commanders, liked/hated combos) are views over the
 * same two tables (card_preferences, combo_preferences), not separate data:
 * a favourite jank card is a liked card tagged 'jank', a favourite
 * commander is a liked card whose resolved data says isCommanderEligible.
 * Nothing here is a new consumer of Supabase beyond what
 * useCardPreferences/useComboPreferences already fetch.
 */
export default function Profile() {
  const { user, loading, configured } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: cardPreferences } = useCardPreferences(user?.id ?? null);
  const { data: comboPreferences } = useComboPreferences(user?.id ?? null);

  const oracleIds = useMemo(
    () => (cardPreferences ?? []).map((preference) => preference.oracleId),
    [cardPreferences],
  );
  const {
    data: resolvedCards,
    isLoading: cardsLoading,
    isError: cardsErrored,
    error: cardsError,
  } = useResolvedCards(oracleIds);
  const cardByOracleId = useMemo(() => {
    const map = new Map<string, ResolvedCard>();
    for (const card of resolvedCards ?? []) map.set(card.oracleId, card);
    return map;
  }, [resolvedCards]);

  if (!configured) {
    return (
      <main className="page-main profile-main">
        <p className="profile-empty">Profiles aren't configured for this deployment.</p>
      </main>
    );
  }

  if (loading) return null;

  if (!user) {
    return (
      <main className="page-main profile-main">
        <h1 className="page-title">Your profile</h1>
        <p className="page-subtitle">Sign in to see the cards and combos you've saved.</p>
        <button
          type="button"
          className="tool-cta profile-signin"
          onClick={() => setDialogOpen(true)}
        >
          Sign in →
        </button>
        {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
      </main>
    );
  }

  const liked = (cardPreferences ?? []).filter((preference) => preference.sentiment === 'like');
  const disliked = (cardPreferences ?? []).filter(
    (preference) => preference.sentiment === 'dislike',
  );
  const likedCombos = (comboPreferences ?? []).filter(
    (preference) => preference.sentiment === 'like',
  );
  const hatedCombos = (comboPreferences ?? []).filter(
    (preference) => preference.sentiment === 'dislike',
  );

  return (
    <main className="page-main profile-main">
      <h1 className="page-title">Your profile</h1>
      <p className="page-subtitle">
        Everything you've liked, disliked, and tagged in the Commander recommender.
      </p>

      {cardsLoading && <p className="profile-loading">Loading card details…</p>}
      {cardsErrored && (
        <p className="profile-error">
          {cardsError instanceof Error ? cardsError.message : 'Could not load card details.'}
        </p>
      )}

      <section className="profile-section">
        <h2 className="profile-section-title">Liked cards</h2>
        {liked.length === 0 ? (
          <p className="profile-empty">
            Nothing liked yet — like a card in the recommender to see it here.
          </p>
        ) : (
          <ul className="profile-card-list">
            {liked.map((preference) => (
              <CardPreferenceRow
                key={preference.id}
                userId={user.id}
                preference={preference}
                card={cardByOracleId.get(preference.oracleId)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Disliked cards</h2>
        {disliked.length === 0 ? (
          <p className="profile-empty">Nothing disliked yet.</p>
        ) : (
          <ul className="profile-card-list">
            {disliked.map((preference) => (
              <CardPreferenceRow
                key={preference.id}
                userId={user.id}
                preference={preference}
                card={cardByOracleId.get(preference.oracleId)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Favourite combos</h2>
        {likedCombos.length === 0 ? (
          <p className="profile-empty">Nothing favourited yet.</p>
        ) : (
          <ul className="profile-combo-list">
            {likedCombos.map((preference) => (
              <ComboPreferenceRow key={preference.id} userId={user.id} preference={preference} />
            ))}
          </ul>
        )}
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Combos you hate</h2>
        {hatedCombos.length === 0 ? (
          <p className="profile-empty">None marked yet.</p>
        ) : (
          <ul className="profile-combo-list">
            {hatedCombos.map((preference) => (
              <ComboPreferenceRow key={preference.id} userId={user.id} preference={preference} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

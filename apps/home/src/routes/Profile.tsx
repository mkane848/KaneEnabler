import { useMemo, useState } from 'react';
import { useAuth, useCardPreferences, useComboPreferences, AuthDialog } from '@mtg/profile';
import type { CardPreference } from '@mtg/profile';
import { useResolvedCards } from '../hooks/useResolvedCards';
import type { ResolvedCard } from '../api/cards';
import { CardPreferenceRow } from '../components/CardPreferenceRow';
import { ComboPreferenceRow } from '../components/ComboPreferenceRow';

/**
 * The "profile/browse page" from docs/handoff.md's Phase 7 — the seven
 * requested lists (liked/disliked cards, favourite jank cards,
 * favourite/disliked commanders, liked/hated combos) are views over the
 * same two tables (card_preferences, combo_preferences), not separate data:
 * a favourite jank card is a liked card tagged 'jank', a favourite
 * commander is a liked card whose resolved data says isCommanderEligible.
 * Nothing here is a new consumer of Supabase beyond what
 * useCardPreferences/useComboPreferences already fetch.
 *
 * Those seven are delivered as a filter over two card sections rather than
 * seven stacked lists, because the sets overlap: a liked, jank-tagged
 * commander belongs to three of them at once, and stacking would render it
 * three times on one page. Picking a lens instead keeps each card in
 * exactly one place and makes "how many commanders have I liked?" legible
 * from the counts.
 */

type CardLens = 'all' | 'commanders' | 'jank';

const LENSES: { id: CardLens; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'commanders', label: 'Commanders' },
  { id: 'jank', label: 'Jank' },
];

/** Section headings per lens, so "Liked cards" narrows to "Favourite commanders". */
const HEADINGS: Record<CardLens, { liked: string; disliked: string }> = {
  all: { liked: 'Liked cards', disliked: 'Disliked cards' },
  commanders: { liked: 'Favourite commanders', disliked: 'Disliked commanders' },
  jank: { liked: 'Favourite jank cards', disliked: 'Disliked jank cards' },
};

function matchesLens(
  preference: CardPreference,
  card: ResolvedCard | undefined,
  lens: CardLens,
): boolean {
  if (lens === 'commanders') return card?.isCommanderEligible === true;
  if (lens === 'jank') return preference.tags.includes('jank');
  return true;
}

export default function Profile() {
  const { user, loading, configured } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lens, setLens] = useState<CardLens>('all');

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

  // Counts are per lens across both sentiments, so a chip reads "how many of
  // my saved cards are commanders" rather than "how many in the section
  // you're looking at" — which would change as you switch lenses.
  const lensCounts = useMemo(() => {
    const counts: Record<CardLens, number> = { all: 0, commanders: 0, jank: 0 };
    for (const preference of cardPreferences ?? []) {
      const card = cardByOracleId.get(preference.oracleId);
      for (const { id } of LENSES) {
        if (matchesLens(preference, card, id)) counts[id] += 1;
      }
    }
    return counts;
  }, [cardPreferences, cardByOracleId]);

  if (!configured) {
    return (
      <main className="mtg-page-main profile-main">
        <p className="profile-empty">Profiles aren't configured for this deployment.</p>
      </main>
    );
  }

  if (loading) return null;

  if (!user) {
    return (
      <main className="mtg-page-main profile-main">
        <h1 className="mtg-page-title">Your profile</h1>
        <p className="mtg-page-subtitle">Sign in to see the cards and combos you've saved.</p>
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

  const inLens = (cardPreferences ?? []).filter((preference) =>
    matchesLens(preference, cardByOracleId.get(preference.oracleId), lens),
  );
  const liked = inLens.filter((preference) => preference.sentiment === 'like');
  const disliked = inLens.filter((preference) => preference.sentiment === 'dislike');
  const likedCombos = (comboPreferences ?? []).filter(
    (preference) => preference.sentiment === 'like',
  );
  const hatedCombos = (comboPreferences ?? []).filter(
    (preference) => preference.sentiment === 'dislike',
  );

  const emptyHint =
    lens === 'commanders'
      ? 'No commanders here yet.'
      : lens === 'jank'
        ? 'Nothing tagged jank yet — use the jank toggle on a saved card.'
        : 'Nothing liked yet — like a card in the recommender to see it here.';

  const cardSection = (
    heading: string,
    preferences: CardPreference[],
    empty: string,
  ): React.ReactElement => (
    <section className="profile-section">
      <h2 className="profile-section-title">{heading}</h2>
      {preferences.length === 0 ? (
        <p className="profile-empty">{empty}</p>
      ) : (
        <ul className="profile-card-list">
          {preferences.map((preference) => (
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
  );

  return (
    <main className="mtg-page-main profile-main">
      <h1 className="mtg-page-title">Your profile</h1>
      <p className="mtg-page-subtitle">
        Everything you've liked, disliked, and tagged in the Commander recommender.
      </p>

      {cardsLoading && <p className="profile-loading">Loading card details…</p>}
      {cardsErrored && (
        <p className="profile-error">
          {cardsError instanceof Error ? cardsError.message : 'Could not load card details.'}
        </p>
      )}

      <div className="profile-lenses" role="group" aria-label="Filter saved cards">
        {LENSES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={['profile-lens', lens === id && 'is-active'].filter(Boolean).join(' ')}
            aria-pressed={lens === id}
            onClick={() => setLens(id)}
          >
            {label}
            <span className="profile-lens-count">{lensCounts[id]}</span>
          </button>
        ))}
      </div>

      {cardSection(HEADINGS[lens].liked, liked, emptyHint)}
      {cardSection(
        HEADINGS[lens].disliked,
        disliked,
        lens === 'all' ? 'Nothing disliked yet.' : 'None disliked here yet.',
      )}

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

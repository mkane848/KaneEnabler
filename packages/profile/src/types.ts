import type { ComboSnapshot } from './comboSnapshot';

export type Sentiment = 'like' | 'dislike';

/**
 * One row per user per card, keyed on Scryfall's oracle_id (not a printing
 * id — a preference is about the card, not one specific printing of it).
 * A favourite commander is the same row read where the card's own
 * is_commander_eligible is true; there's no separate commander table to
 * drift from this one. Jank is a tag, not a separate list — a jank card is
 * a card you like *for being jank*.
 */
export interface CardPreference {
  id: string;
  userId: string;
  oracleId: string;
  sentiment: Sentiment;
  tags: string[];
  note: string | null;
  createdAt: string;
}

export type CardPreferenceInput = Pick<CardPreference, 'oracleId' | 'sentiment'> &
  Partial<Pick<CardPreference, 'tags' | 'note'>>;

/**
 * comboKey (not spellbookId, which is nullable and an unverified live
 * contract) identifies the combo. snapshot is what the profile renders —
 * favouriting never re-queries Commander Spellbook; only an explicit
 * per-combo refresh does, which re-fetches and overwrites this snapshot.
 */
export interface ComboPreference {
  id: string;
  userId: string;
  comboKey: string;
  sentiment: Sentiment;
  spellbookId: string | null;
  snapshot: ComboSnapshot;
  fetchedAt: string;
  createdAt: string;
}

export type ComboPreferenceInput = Pick<ComboPreference, 'comboKey' | 'sentiment'> &
  Partial<Pick<ComboPreference, 'spellbookId'>> & {
    /**
     * The combo DTO as shown at favourite time — written to jsonb exactly as
     * given. Deliberately `unknown` at the write boundary (the caller hands us
     * any combo-shaped object); it is validated into a `ComboSnapshot` at the
     * read boundary in `fromComboRow`.
     */
    snapshot: unknown;
  };

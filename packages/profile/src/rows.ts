import type { CardPreference, ComboPreference } from './types';

/** Raw shapes as Postgres/PostgREST returns them (snake_case) — see the migration in Supabase. */
export interface CardPreferenceRow {
  id: string;
  user_id: string;
  oracle_id: string;
  sentiment: 'like' | 'dislike';
  tags: string[];
  note: string | null;
  created_at: string;
}

export interface ComboPreferenceRow {
  id: string;
  user_id: string;
  combo_key: string;
  sentiment: 'like' | 'dislike';
  spellbook_id: string | null;
  snapshot: unknown;
  fetched_at: string;
  created_at: string;
}

export function fromCardRow(row: CardPreferenceRow): CardPreference {
  return {
    id: row.id,
    userId: row.user_id,
    oracleId: row.oracle_id,
    sentiment: row.sentiment,
    tags: row.tags,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function fromComboRow(row: ComboPreferenceRow): ComboPreference {
  return {
    id: row.id,
    userId: row.user_id,
    comboKey: row.combo_key,
    sentiment: row.sentiment,
    spellbookId: row.spellbook_id,
    snapshot: row.snapshot,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
  };
}

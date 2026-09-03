import { fetchWithWakeRetry } from '@mtg/api-client';

export interface ResolvedCard {
  oracleId: string;
  name: string;
  imageUri: string | null;
  backImageUri: string | null;
  backName: string | null;
  typeLine: string | null;
  scryfallUri: string | null;
  isCommanderEligible: boolean;
}

// Empty in dev (nothing proxies /api for this app — the profile page talks
// to the recommender's server directly, cross-origin). In production,
// scripts/build-platform.mjs's buildCommand sets VITE_API_URL for the whole
// combined-platform build, so this app picks up the same value the
// recommender client's own api/client.ts does, already flowing into this
// app's build unmodified.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const UNREACHABLE_MESSAGE =
  "Couldn't reach the recommender's server to load your saved cards. It sleeps after a spell " +
  'of inactivity and can take a minute to wake up — give it a moment and try again.';

/** Resolves stored oracle_ids (card_preferences only keeps the id) back to name/image/commander data. */
export async function fetchCardsByOracleIds(oracleIds: string[]): Promise<ResolvedCard[]> {
  if (oracleIds.length === 0) return [];

  const query = new URLSearchParams({ ids: oracleIds.join(',') });
  const body = await fetchWithWakeRetry<{ cards: ResolvedCard[] }>(
    `${API_BASE}/api/cards?${query.toString()}`,
    { method: 'GET', unreachableMessage: UNREACHABLE_MESSAGE },
  );
  return body.cards;
}

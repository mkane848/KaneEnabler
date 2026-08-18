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

// Same free-tier cold-start story as commander-recommender/client's own
// api/client.ts (this hits the same server) — see that file's comment for
// why fetch rejects outright while the instance is waking, and why that's
// worth retrying rather than surfacing immediately.
const WAKE_BUDGET_MS = 75_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 8_000;

const UNREACHABLE_MESSAGE =
  "Couldn't reach the recommender's server to load your saved cards. It sleeps after a spell " +
  'of inactivity and can take a minute to wake up — give it a moment and try again.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isUnreachable(error: unknown): boolean {
  return error instanceof TypeError;
}

/** Resolves stored oracle_ids (card_preferences only keeps the id) back to name/image/commander data. */
export async function fetchCardsByOracleIds(oracleIds: string[]): Promise<ResolvedCard[]> {
  if (oracleIds.length === 0) return [];

  const query = new URLSearchParams({ ids: oracleIds.join(',') });
  const deadline = Date.now() + WAKE_BUDGET_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/api/cards?${query.toString()}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}) as { error?: string });
        throw new Error(payload.error ?? `Request failed with status ${response.status}`);
      }

      const body = (await response.json()) as { cards: ResolvedCard[] };
      return body.cards;
    } catch (error) {
      if (!isUnreachable(error)) throw error;
      if (Date.now() >= deadline) throw new Error(UNREACHABLE_MESSAGE);

      await sleep(Math.min(RETRY_BASE_MS * attempt, RETRY_MAX_MS));
    }
  }
}

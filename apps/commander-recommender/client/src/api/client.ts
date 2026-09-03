import type {
  ComboLookupResponse,
  RecommendResponse,
  ServerMeta,
  WireRecommendResponse,
} from '../types';
import { rehydrateRecommendations } from '../lib/rehydrate';
import { fetchWithWakeRetry } from '@mtg/api-client';

// In dev, this is left empty and Vite's proxy forwards /api to localhost:4000
// (see vite.config.ts). In production, set VITE_API_URL to your deployed
// backend's URL (e.g. https://mtg-recommender-server.onrender.com) since the
// frontend and backend are served from different domains there.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const UNREACHABLE_MESSAGE =
  "Couldn't reach the server. It sleeps after a spell of inactivity and can take " +
  'a minute to wake up — give it a moment and try again.';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchWithWakeRetry<T>(`${API_BASE}${path}`, {
    method: 'POST',
    body,
    unreachableMessage: UNREACHABLE_MESSAGE,
    describeError: (payload, status) => {
      const wait = payload.retryAfterSeconds
        ? ` Try again in about ${payload.retryAfterSeconds}s.`
        : '';
      return (payload.error ?? `Request failed with status ${status}`) + wait;
    },
  });
}

/**
 * Nudges the API awake without waiting for it.
 *
 * Called once when the app loads so the instance is warming while the user is
 * still pasting a list, which usually hides the wake-up entirely. Failures are
 * ignored on purpose: this is opportunistic, and the real request retries.
 */
export function wakeServer(): void {
  void fetch(`${API_BASE}/api/health`, { method: 'GET' }).catch(() => {});
}

export async function fetchRecommendations(rawList: string): Promise<RecommendResponse> {
  // Cited cards arrive once with citations by position; put them back here so
  // the rest of the app never sees the wire shape. See lib/rehydrate.ts.
  return rehydrateRecommendations(
    await postJson<WireRecommendResponse>('/api/recommend', { list: rawList }),
  );
}

/**
 * How current the server's card data is.
 *
 * A plain fetch with no wake-up retry: this only feeds a line in the About
 * dialog, so a sleeping server should leave that line blank rather than hold
 * a modal open for a minute. Callers treat a rejection as "unknown".
 */
export async function fetchMeta(): Promise<ServerMeta> {
  const response = await fetch(`${API_BASE}/api/meta`);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return (await response.json()) as ServerMeta;
}

/**
 * Asks Commander Spellbook (via our server) which combos this commander unit
 * (one name, or two under a Partner-family ability) makes with the user's
 * cards. Only called from an explicit click — never on load.
 */
export function fetchCombos(
  rawList: string,
  commanderNames: string[],
): Promise<ComboLookupResponse> {
  return postJson<ComboLookupResponse>('/api/combos', { list: rawList, commanderNames });
}

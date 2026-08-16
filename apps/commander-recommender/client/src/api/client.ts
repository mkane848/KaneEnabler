import type {
  ComboLookupResponse,
  RecommendResponse,
  ServerMeta,
  WireRecommendResponse,
} from '../types';
import { rehydrateRecommendations } from '../lib/rehydrate';

// In dev, this is left empty and Vite's proxy forwards /api to localhost:4000
// (see vite.config.ts). In production, set VITE_API_URL to your deployed
// backend's URL (e.g. https://mtg-recommender-server.onrender.com) since the
// frontend and backend are served from different domains there.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// The API runs on a free instance that sleeps after ~15 minutes idle and takes
// 30-60s to wake. While it is waking, fetch rejects outright — no response, no
// status — which browsers report as "CORS request did not succeed", an error
// that has nothing to do with CORS and sends you looking in the wrong place.
// So keep retrying a *connection* failure for long enough to cover a wake-up.
const WAKE_BUDGET_MS = 75_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 8_000;

const UNREACHABLE_MESSAGE =
  "Couldn't reach the server. It sleeps after a spell of inactivity and can take " +
  'a minute to wake up — give it a moment and try again.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for a failure where no response arrived at all — the server is asleep,
 * unreachable, or the network dropped. fetch signals this by rejecting with a
 * TypeError, as opposed to resolving with an error status.
 *
 * Errors we raise ourselves are plain Errors, so they are never mistaken for
 * this and never retried.
 */
function isUnreachable(error: unknown): boolean {
  return error instanceof TypeError;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const deadline = Date.now() + WAKE_BUDGET_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({}) as { error?: string; retryAfterSeconds?: number });
        const wait = payload.retryAfterSeconds ? ` Try again in about ${payload.retryAfterSeconds}s.` : '';
        throw new Error((payload.error ?? `Request failed with status ${response.status}`) + wait);
      }

      return (await response.json()) as T;
    } catch (error) {
      // A real HTTP error, or a response we couldn't parse — report it as-is.
      if (!isUnreachable(error)) throw error;
      if (Date.now() >= deadline) throw new Error(UNREACHABLE_MESSAGE);

      await sleep(Math.min(RETRY_BASE_MS * attempt, RETRY_MAX_MS));
    }
  }
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
    await postJson<WireRecommendResponse>('/api/recommend', { list: rawList })
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
export function fetchCombos(rawList: string, commanderNames: string[]): Promise<ComboLookupResponse> {
  return postJson<ComboLookupResponse>('/api/combos', { list: rawList, commanderNames });
}

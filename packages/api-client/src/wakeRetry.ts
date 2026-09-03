/**
 * Wake-retrying fetch for the platform's free-tier Render service.
 *
 * The API sleeps after ~15 minutes idle and takes 30-60 seconds to wake.
 * While waking, `fetch` rejects outright — no response, no status — which
 * browsers report as "CORS request did not succeed", an error that has
 * nothing to do with CORS and sends you looking in the wrong place. So this
 * keeps retrying a *connection* failure for long enough to cover a wake-up.
 *
 * This was duplicated near-verbatim between the recommender client's
 * `api/client.ts` (POST) and apps/home's `api/cards.ts` (GET). One shared
 * helper kills the pair and keeps the wake-budget constants in one place.
 */

export interface WakeRetryOptions {
  method: 'GET' | 'POST';
  /** JSON body for POST. Omit for GET. */
  body?: unknown;
  /** Baked into the final "still unreachable" error message. */
  unreachableMessage: string;
  /** Budget for the whole retry loop, in ms. Defaults to 75s. */
  wakeBudgetMs?: number;
  /** Initial backoff in ms (doubles each attempt up to retryMaxMs). */
  retryBaseMs?: number;
  /** Backoff ceiling in ms. */
  retryMaxMs?: number;
  /**
   * Maps a non-ok response's parsed body to a user-facing error. Defaults to
   * reading `payload.error`, with an optional `retryAfterSeconds` suffix.
   */
  describeError?: (
    payload: { error?: string; retryAfterSeconds?: number },
    status: number,
  ) => string;
}

const DEFAULT_WAKE_BUDGET_MS = 75_000;
const DEFAULT_RETRY_BASE_MS = 2_000;
const DEFAULT_RETRY_MAX_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True for a failure where no response arrived at all — the server is
 * asleep, unreachable, or the network dropped. `fetch` signals this by
 * rejecting with a TypeError, as opposed to resolving with an error status.
 * Errors raised by the caller/this module are plain `Error`s and never
 * mistaken for this, so they are never retried.
 */
function isUnreachable(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Fetches `url` and parses JSON, retrying connection-level (TypeError)
 * failures until the wake budget expires. HTTP errors (4xx/5xx) resolve and
 * are turned into a descriptive `Error` immediately — no retry.
 */
export async function fetchWithWakeRetry<T>(url: string, options: WakeRetryOptions): Promise<T> {
  const budget = options.wakeBudgetMs ?? DEFAULT_WAKE_BUDGET_MS;
  const base = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const max = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
  const deadline = Date.now() + budget;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body == null ? undefined : JSON.stringify(options.body),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({}) as { error?: string; retryAfterSeconds?: number });
        const describe =
          options.describeError ??
          ((body, status) => body.error ?? `Request failed with status ${status}`);
        throw new Error(describe(payload, response.status));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (!isUnreachable(error)) throw error;
      if (Date.now() >= deadline) throw new Error(options.unreachableMessage);
      await sleep(Math.min(base * attempt, max));
    }
  }
}

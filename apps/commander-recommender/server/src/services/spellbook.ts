/**
 * Commander Spellbook lookup.
 *
 * This is only ever called because someone clicked "Find combos" on a
 * specific commander — nothing here runs on a timer, on page load, or as
 * part of a recommendation. That is deliberate: it is their service, and
 * `find-my-combos` is the endpoint they built for exactly this question, so
 * we ask it once, only when asked, and remember the answer.
 *
 * Politeness measures, in the same spirit:
 *   - an identifying User-Agent, so they can see who is calling
 *   - an in-memory cache, so repeat clicks on the same deck cost them nothing
 *   - a request timeout, so a hung call doesn't hold a connection open
 *   - no automatic retry on 429; we surface their Retry-After and stop,
 *     rather than adding load to a service that just told us to back off
 *   - a server-side cooldown after a 429, so we actually stop until their
 *     Retry-After has passed instead of relying on the user to
 *   - identical concurrent lookups share one request, and expired cache
 *     entries are pruned, so a burst of clicks can't multiply calls
 *   - answers are also kept in a shared Supabase table (spellbookStore.ts),
 *     so a restart or another user asking the same question costs them
 *     nothing either — within the same one-hour freshness window
 */

const ENDPOINT =
  process.env.SPELLBOOK_ENDPOINT ?? 'https://backend.commanderspellbook.com/find-my-combos';
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // an hour; combo data changes slowly
const MAX_CARDS = 250; // a Commander deck is 100; this is a sanity bound
/** How long to back off after a 429 that didn't carry a usable Retry-After. */
const DEFAULT_COOLDOWN_SECONDS = 60;

import { APP_VERSION } from '../version.generated';
import { storeFromEnv, type SpellbookStore } from './spellbookStore';

const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent': `CommanderIHardlyKnowEr/${APP_VERSION} (hobby project; https://github.com/mkane848/KaneEnabler)`,
};

export interface ComboResult {
  id: string | null;
  permalink: string | null;
  cards: string[];
  produces: string[];
  description: string | null;
  /** For near-misses: pieces you don't have. Empty for combos you can cast. */
  missing: string[];
}

export interface ComboLookup {
  ready: ComboResult[];
  almost: ComboResult[];
  /** True when the answer came from cache, so we didn't call them at all. */
  cached: boolean;
}

export class SpellbookError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'SpellbookError';
  }
}

type Lookup = Omit<ComboLookup, 'cached'>;

const cache = new Map<string, { at: number; value: Lookup }>();
/** Identical concurrent lookups share one upstream request. */
const inFlight = new Map<string, Promise<ComboLookup>>();
/** The shared layer behind `cache`; null when Supabase isn't configured. */
let store: SpellbookStore<Lookup> | null = storeFromEnv<Lookup>(CACHE_TTL_MS);

/** Tests swap the shared store for a fake (or none). */
export function setSpellbookStore(next: SpellbookStore<Lookup> | null): void {
  store = next;
}
/** Epoch ms until which a 429's Retry-After says we must not call again. */
let cooldownUntil = 0;

/** Drops entries past their TTL so the process doesn't retain them forever. */
function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.at >= CACHE_TTL_MS) cache.delete(key);
  }
}

function cacheKey(commanderNames: string[], cards: string[]): string {
  return JSON.stringify([
    [...commanderNames].map((c) => c.toLowerCase()).sort(),
    [...cards].map((c) => c.toLowerCase()).sort(),
  ]);
}

/**
 * Pulls a card name out of whatever shape the entry uses.
 *
 * The response is normalised defensively on purpose: this is parsed from a
 * third-party API whose exact field names we can't pin down from their public
 * docs, and a card list arriving as `[{card: {name}}]` vs `[{card}]` vs
 * `[name]` should not be the difference between a working feature and a
 * crash. Anything genuinely unrecognisable is dropped rather than guessed at.
 */
function readName(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;

  const record = entry as Record<string, unknown>;
  for (const key of ['card', 'feature', 'template']) {
    const nested = record[key];
    if (typeof nested === 'string') return nested;
    if (nested && typeof nested === 'object') {
      const name = (nested as Record<string, unknown>).name;
      if (typeof name === 'string') return name;
    }
  }
  return typeof record.name === 'string' ? record.name : null;
}

function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readName).filter((name): name is string => !!name);
}

function normalizeVariant(variant: unknown, ownedLower: Set<string>): ComboResult | null {
  if (!variant || typeof variant !== 'object') return null;
  const v = variant as Record<string, unknown>;

  const cards = readNames(v.uses).length ? readNames(v.uses) : readNames(v.cards);
  if (cards.length === 0) return null;

  const produces = readNames(v.produces).length ? readNames(v.produces) : readNames(v.results);
  const id = typeof v.id === 'string' || typeof v.id === 'number' ? String(v.id) : null;
  const description =
    typeof v.description === 'string'
      ? v.description
      : typeof v.steps === 'string'
        ? v.steps
        : null;

  return {
    id,
    permalink:
      typeof v.permalink === 'string'
        ? v.permalink
        : id
          ? `https://commanderspellbook.com/combo/${id}/`
          : null,
    cards,
    produces,
    description,
    missing: cards.filter((card) => !ownedLower.has(card.toLowerCase())),
  };
}

function describeFailure(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `HTTP ${status}`;
  return `HTTP ${status}: ${trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed}`;
}

/**
 * Asks Commander Spellbook which combos this commander (one card, or two
 * under a Partner-family ability) and these cards make. Returns combos you
 * can already assemble, plus near-misses one card short.
 */
export async function findCombos(
  commanderNames: string[],
  cardNames: string[],
): Promise<ComboLookup> {
  const cards = cardNames.slice(0, MAX_CARDS);
  const key = cacheKey(commanderNames, cards);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return { ...hit.value, cached: true };
  }

  // Identical concurrent lookups share one miss — the shared-store read and,
  // if that misses too, one upstream request — rather than racing two.
  const running = inFlight.get(key);
  if (running) return running;

  const request = resolveMiss(commanderNames, cards, key).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

async function resolveMiss(
  commanderNames: string[],
  cards: string[],
  key: string,
): Promise<ComboLookup> {
  // The shared store answers even during a 429 cooldown: a stored answer
  // costs Spellbook nothing.
  const stored = await readStore(key);
  if (stored) {
    cache.set(key, { at: stored.fetchedAt, value: stored.value });
    return { ...stored.value, cached: true };
  }

  // A 429 is the service telling us to stop, not a cue to keep asking. Until
  // the window it gave us (or the default, if it didn't give one) has passed,
  // answer from the cooldown instead of making another request.
  const now = Date.now();
  if (cooldownUntil > now) {
    throw new SpellbookError(
      'Commander Spellbook is rate limiting requests right now.',
      429,
      Math.ceil((cooldownUntil - now) / 1000),
    );
  }

  const value = await fetchAndNormalize(commanderNames, cards, key);
  writeStore(key, value);
  return { ...value, cached: false };
}

async function readStore(key: string) {
  if (!store) return null;
  try {
    const stored = await store.get(key);
    return stored && Date.now() - stored.fetchedAt < CACHE_TTL_MS ? stored : null;
  } catch (err) {
    console.warn('Spellbook shared cache read failed; asking Spellbook instead.', err);
    return null;
  }
}

/** Fire-and-forget: the lookup already succeeded, and a failed write must not undo that. */
function writeStore(key: string, value: Lookup): void {
  store?.put(key, value).catch((err: unknown) => {
    console.warn('Spellbook shared cache write failed.', err);
  });
}

async function fetchAndNormalize(
  commanderNames: string[],
  cards: string[],
  key: string,
): Promise<Lookup> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        commanders: commanderNames.map((card) => ({ card })),
        main: cards.map((card) => ({ card })),
      }),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
    throw new SpellbookError(`Commander Spellbook ${reason}.`, 504);
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const seconds =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_COOLDOWN_SECONDS;
    cooldownUntil = Date.now() + seconds * 1000;
    throw new SpellbookError(
      'Commander Spellbook is rate limiting requests right now.',
      429,
      seconds,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new SpellbookError(
      `Commander Spellbook rejected the lookup (${describeFailure(response.status, body)})`,
      response.status,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const results = (payload.results ?? payload) as Record<string, unknown>;

  const ownedLower = new Set([
    ...commanderNames.map((c) => c.toLowerCase()),
    ...cards.map((c) => c.toLowerCase()),
  ]);
  const toResults = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((variant) => normalizeVariant(variant, ownedLower))
      .filter((combo): combo is ComboResult => !!combo);

  const value = {
    ready: toResults(results.included),
    almost: toResults(results.almostIncluded),
  };

  pruneCache(Date.now());
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Exposed so tests can start from a known state. */
export function clearComboCache(): void {
  cache.clear();
  inFlight.clear();
  cooldownUntil = 0;
}

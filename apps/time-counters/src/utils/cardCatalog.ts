import type { CardData } from '../types';
import { JESKAI_COLORS, isWithinIdentity } from './colorIdentity.mjs';

/**
 * The catalog is every Commander-legal card in the Jeskai color identity —
 * roughly 16k entries, a few megabytes of JSON. It is fetched from
 * public/cards.json at runtime rather than imported, so it stays out of the
 * JavaScript bundle and never blocks first paint.
 */
let cache: CardData[] | null = null;
let inFlight: Promise<CardData[]> | null = null;

export function loadCatalog(): Promise<CardData[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetch(`${import.meta.env.BASE_URL}cards.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Card catalog request failed: HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: CardData[]) => {
        if (!Array.isArray(raw)) throw new Error('Card catalog is not an array.');
        // Defensive: the app never surfaces a card outside this deck's identity,
        // even if cards.json was generated or hand-edited without that filter.
        cache = raw.filter((c) => isWithinIdentity(c.colorIdentity, JESKAI_COLORS));
        return cache;
      })
      .catch((err) => {
        inFlight = null; // let a later attempt retry rather than caching the failure
        throw err;
      });
  }
  return inFlight;
}

/**
 * Substring search over the catalog, name-anchored matches first.
 *
 * loadCatalog keeps the catalog alphabetized (it's written that way to
 * cards.json), so scanning it in order and bucketing into "starts with"
 * vs. "merely contains" already produces each bucket in the right relative
 * order — no separate sort over the matches needed. Once the anchored
 * bucket alone has `limit` entries nothing later in the scan could
 * possibly displace them (an anchored match always outranks a contains-only
 * one), so the scan stops there instead of always walking the full ~16k
 * catalog on every keystroke.
 */
export function searchCards(catalog: CardData[], query: string, limit = 8): CardData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const anchored: CardData[] = [];
  const contains: CardData[] = [];
  for (const card of catalog) {
    const name = card.name.toLowerCase();
    if (name.startsWith(q)) {
      anchored.push(card);
      if (anchored.length >= limit) break;
    } else if (contains.length < limit && name.includes(q)) {
      contains.push(card);
    }
  }
  return anchored.length >= limit ? anchored : [...anchored, ...contains].slice(0, limit);
}

/** Exact (case-insensitive) name lookup — used to feature specific cards, e.g. the commanders. */
export function findCardByName(catalog: CardData[], name: string): CardData | undefined {
  const target = name.toLowerCase();
  return catalog.find((c) => c.name.toLowerCase() === target);
}

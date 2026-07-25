import type { CardData } from '../types';
import { JESKAI_COLORS, isWithinIdentity } from './colorIdentity';

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
      .then(res => {
        if (!res.ok) throw new Error(`Card catalog request failed: HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: CardData[]) => {
        if (!Array.isArray(raw)) throw new Error('Card catalog is not an array.');
        // Defensive: the app never surfaces a card outside this deck's identity,
        // even if cards.json was generated or hand-edited without that filter.
        cache = raw.filter(c => isWithinIdentity(c.colorIdentity, JESKAI_COLORS));
        return cache;
      })
      .catch(err => {
        inFlight = null; // let a later attempt retry rather than caching the failure
        throw err;
      });
  }
  return inFlight;
}

/** Substring search over the catalog, name-anchored matches first. */
export function searchCards(catalog: CardData[], query: string, limit = 8): CardData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: CardData[] = [];
  for (const card of catalog) {
    if (card.name.toLowerCase().includes(q)) matches.push(card);
  }
  return matches
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Exact (case-insensitive) name lookup — used to feature specific cards, e.g. the commanders. */
export function findCardByName(catalog: CardData[], name: string): CardData | undefined {
  const target = name.toLowerCase();
  return catalog.find(c => c.name.toLowerCase() === target);
}

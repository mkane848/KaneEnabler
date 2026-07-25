import type { CardData } from '../types';
import raw from '../data/cards.json';
import { JESKAI_COLORS, isWithinIdentity } from './colorIdentity';

/**
 * Defensive filter: even if cards.json was regenerated without the Jeskai
 * filter (see scripts/fetch-card-data.mjs) or hand-edited, the app itself
 * never surfaces a card outside this deck's color identity.
 */
const CATALOG = (raw as CardData[]).filter(c => isWithinIdentity(c.colorIdentity ?? c.colors, JESKAI_COLORS));

export function catalogSize(): number {
  return CATALOG.length;
}

/** Simple substring search over the bundled deck list, name-anchored matches first. */
export function searchCards(query: string, limit = 8): CardData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CATALOG.filter(c => c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Exact (case-insensitive) name lookup — used to feature specific cards, e.g. the commanders. */
export function getCardByName(name: string): CardData | undefined {
  return CATALOG.find(c => c.name.toLowerCase() === name.toLowerCase());
}

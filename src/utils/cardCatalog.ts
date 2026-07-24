import type { CardData } from '../types';
import raw from '../data/cards.json';

const CATALOG = raw as CardData[];

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

import { isCommanderLegal } from '@mtg/rules';
import type { CardRow } from '../types';
import type { ParsedListEntry } from './parseList';
import type { OwnedCard } from './synergy';

/**
 * Splits a parsed decklist into what actually counts toward synergy scoring
 * versus what got left out, and why. A banned card is reported the same way
 * "not found" already is, rather than silently vanishing from the count —
 * without that, a trimmed-but-legal list and one that quietly dropped a
 * banned card would look identical in the response.
 */
export function partitionSubmittedCards(
  parsed: ParsedListEntry[],
  nameMap: Map<string, CardRow>,
): { submitted: OwnedCard[]; notFound: string[]; banned: string[] } {
  const submitted: OwnedCard[] = [];
  const notFound: string[] = [];
  const banned: string[] = [];

  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (!row) {
      notFound.push(entry.name);
    } else if (!isCommanderLegal(row)) {
      banned.push(entry.name);
    } else {
      submitted.push({ row, quantity: entry.quantity });
    }
  }

  return { submitted, notFound, banned };
}

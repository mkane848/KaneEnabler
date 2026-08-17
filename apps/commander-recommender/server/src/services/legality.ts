import type { CardRow } from '../types';
import type { ParsedListEntry } from './parseList';
import type { OwnedCard } from './synergy';

/**
 * Whether this card can actually sit in a Commander deck. Scryfall's
 * legality field covers more than the binary "legal"/"banned" the name
 * suggests — "not_legal" (never printed for a legal set, or a card type the
 * format doesn't allow) and "restricted" (a Vintage-only status that should
 * never appear here) both mean the same thing for a submitted list: this
 * card cannot go in the 99, so it should not silently count as synergy
 * support or deck-analysis evidence. getCommanderCandidates already applies
 * this same check when picking which cards can be suggested *as* a
 * commander — this is the same rule applied to the cards submitted
 * alongside one.
 */
export function isCommanderLegal(row: CardRow): boolean {
  return row.legality_commander === 'legal';
}

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

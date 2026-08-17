import { isWithinColorIdentity } from './colorIdentity.js';

/** CR 903.5a: a Commander deck contains exactly 100 cards, including its commander(s) — the minimum and maximum deck size are both 100. */
export const COMMANDER_DECK_SIZE = 100;

export function isValidDeckSize(totalCards: number): boolean {
  return totalCards === COMMANDER_DECK_SIZE;
}

/**
 * Combines one or more commanders' color identities into the deck's single
 * allowed identity. A commander unit's cards are jointly "the commander"
 * (702.124e) — a Partner pair's allowed identity is the union of both
 * halves' identities, not either one alone.
 */
export function combinedColorIdentity(
  commanderIdentities: readonly (readonly string[])[],
): Set<string> {
  const identity = new Set<string>();
  for (const cardIdentity of commanderIdentities) {
    for (const color of cardIdentity) identity.add(color);
  }
  return identity;
}

/** The slice of a card this rule needs. */
export interface DeckCardLike {
  color_identity: readonly string[];
}

/**
 * Every one of a deck's cards whose color identity falls outside the
 * commander's (903.4) — an empty result means the deck is legal on this
 * axis. Returns the offending cards rather than a bare boolean, so a
 * caller can report which ones need to come out.
 */
export function findColorIdentityViolations<TCard extends DeckCardLike>(
  deck: readonly TCard[],
  commanderIdentity: ReadonlySet<string>,
): TCard[] {
  return deck.filter((card) => !isWithinColorIdentity(card.color_identity, commanderIdentity));
}

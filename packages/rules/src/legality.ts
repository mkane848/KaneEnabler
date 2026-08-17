/**
 * Whether a card can actually sit in a Commander deck. Scryfall's legality
 * field covers more than the binary "legal"/"banned" the name suggests —
 * "not_legal" (never printed for a legal set, or a card type the format
 * doesn't allow) and "restricted" (a Vintage-only status that should never
 * appear here) both mean the same thing: this card cannot go in the deck.
 */

/** The slice of a card this rule needs. */
export interface LegalityCardLike {
  legality_commander: string;
}

export function isCommanderLegal(card: LegalityCardLike): boolean {
  return card.legality_commander === 'legal';
}

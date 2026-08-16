/**
 * Sending each cited card once instead of once per commander.
 *
 * A supporting card is, by definition, one of the cards *you* uploaded — so
 * the distinct set can never be larger than your list, while the number of
 * citations grows with the number of commanders suggested. On a 30-card
 * aristocrats list that came to **26,618 serialized card entries backed by 28
 * distinct cards**, and 84% of a 12.2 MB response. The ratio gets worse with
 * a bigger collection, not better, because a bigger collection matches more
 * commanders.
 *
 * So the response carries the cards once and cites them by position. The
 * client rehydrates on receipt, so nothing downstream has to know.
 *
 * Only the commander suggestions are indexed. The deck summary's cards are
 * left inline: it is 0.5% of the payload, its cards carry per-theme `roles`
 * that differ between citations, and its *suggestions* are cards you don't
 * own — none of which is the case being solved here.
 */
import type { SupportingCard } from './synergy';

export interface CardIndex {
  /** Position of this card in the index, adding it if it is new. */
  indexOf(card: SupportingCard): number;
  /** The distinct cards, in the order they were first cited. */
  cards: SupportingCard[];
}

export function createCardIndex(): CardIndex {
  const cards: SupportingCard[] = [];
  // Keyed on name: Commander is singleton, so a name identifies a card within
  // one collection, and every citation of it carries identical fields —
  // including quantity, which comes from the list rather than the commander.
  const positionByName = new Map<string, number>();

  return {
    cards,
    indexOf(card) {
      const existing = positionByName.get(card.name);
      if (existing !== undefined) return existing;
      const position = cards.length;
      cards.push(card);
      positionByName.set(card.name, position);
      return position;
    },
  };
}

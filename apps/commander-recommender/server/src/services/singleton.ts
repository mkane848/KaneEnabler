import { singletonLimit } from '@mtg/rules';
import type { OwnedCard } from './synergy';

/**
 * Commander is a singleton format (rule 903.5b): apart from basic lands, a
 * deck may not contain more than one card with a given English name. The
 * rule itself (`singletonLimit`) lives in `@mtg/rules`; what's here is
 * specific to a submitted list, not the rule — merging repeated lines and
 * capping quantities.
 *
 * That matters for recommendations, not just deck legality. A list pasted
 * from a collection or a draft pool can carry ten copies of a common, and
 * counting all ten would let one card impersonate a whole strategy — ten
 * Rats reading as a Rats deck you could not actually build.
 */

export interface SingletonResult {
  owned: OwnedCard[];
  /** Copies dropped for exceeding the format's limit, so the user can be told. */
  ignoredCopies: number;
}

/**
 * Collapses a parsed list to what could legally be in one Commander deck.
 *
 * Also merges repeats of the same card, which the list parser deliberately
 * does not do — a card can appear on several lines ("1 Sol Ring" twice, or
 * once in the deck and once in a sideboard section) rather than as a single
 * line with a count. Without merging, those would survive as separate
 * entries and each be counted as a distinct card supporting a theme.
 */
export function applySingletonLimits(owned: OwnedCard[]): SingletonResult {
  const byCard = new Map<string, OwnedCard>();
  for (const entry of owned) {
    const existing = byCard.get(entry.row.oracle_id);
    // A fresh object rather than mutating the caller's entry — the raw list
    // is still needed to report how many copies were submitted.
    if (existing) existing.quantity += entry.quantity;
    else byCard.set(entry.row.oracle_id, { row: entry.row, quantity: entry.quantity });
  }

  let ignoredCopies = 0;
  const result: OwnedCard[] = [];
  for (const entry of byCard.values()) {
    const allowed = Math.min(entry.quantity, singletonLimit(entry.row));
    ignoredCopies += entry.quantity - allowed;
    result.push({ row: entry.row, quantity: allowed });
  }

  return { owned: result, ignoredCopies };
}

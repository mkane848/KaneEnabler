import type { CardRow } from '../types';
import type { OwnedCard } from './synergy';

/**
 * Commander is a singleton format (rule 903.5b): apart from basic lands, a
 * deck may not contain more than one card with a given English name.
 *
 * That matters for recommendations, not just deck legality. A list pasted
 * from a collection or a draft pool can carry ten copies of a common, and
 * counting all ten would let one card impersonate a whole strategy — ten
 * Rats reading as a Rats deck you could not actually build.
 */

// The two ways a card grants its own exemption. Both are printed rules text,
// so they are read off the card rather than kept as a hardcoded name list
// that would go stale every set.
const ANY_NUMBER = /a deck can have any number of cards named/i;
const UP_TO_N = /a deck can have up to (\w+) cards named/i;

// Only ever needed for the handful of "up to N" cards that exist (Seven
// Dwarves, Nazgûl), but spelled out generously so a new one does not
// silently fall back to 1.
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/**
 * How many copies of this card a Commander deck may legally contain.
 * `Infinity` for basic lands and the "any number" cards.
 */
export function singletonLimit(row: CardRow): number {
  // Exempt by supertype rather than by name, which covers snow basics
  // ("Basic Snow Land — Forest") and Wastes without enumerating anything.
  // Both halves are required: "Land — Forest" is a nonbasic Forest.
  const typeLine = row.type_line ?? '';
  if (/\bBasic\b/i.test(typeLine) && /\bLand\b/i.test(typeLine)) return Infinity;

  const text = row.oracle_text ?? '';
  if (ANY_NUMBER.test(text)) return Infinity;

  const capped = UP_TO_N.exec(text);
  if (capped) {
    const limit = NUMBER_WORDS[capped[1].toLowerCase()];
    if (limit) return limit;
  }

  return 1;
}

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

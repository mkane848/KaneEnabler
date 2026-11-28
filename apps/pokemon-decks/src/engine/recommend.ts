/**
 * Collection → ranked decks, and the attacker list for "build around".
 */
import { hasRuleBox, isPokemon, type PtcgCard } from '@ptcg/rules';
import { buildDeck, damageValue, bestAttack, resolveLine, type BuiltDeck } from './build';
import type { Owned } from './collection';
import type { Pool } from './pool';

export interface RankedDeck extends BuiltDeck {
  score: number;
  breakdown: { owned: number; line: number; trainers: number; strength: number };
}

/** Two prints are the same attacker when they share a name and attacks. */
function attackerKey(card: PtcgCard): string {
  return `${card.name}|${(card.attacks ?? []).map((a) => `${a.name}:${a.damage ?? ''}`).join(';')}`;
}

/**
 * Every legal Pokémon worth building around: one that hits for damage. One
 * print per distinct card, newest first, so a reprint doesn't list twice.
 */
export function attackerCandidates(pool: Pool): PtcgCard[] {
  const byKey = new Map<string, PtcgCard>();
  for (const prints of pool.pokemonByName.values()) {
    for (const card of prints) {
      if (!isPokemon(card) || damageValue(bestAttack(card)?.damage) === 0) continue;
      if (pool.format === 'glc' && hasRuleBox(card)) continue;
      byKey.set(attackerKey(card), card);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The weights are the engine's own judgement, shown to the player as a
// breakdown rather than hidden in one number.
const WEIGHTS = { owned: 0.45, line: 0.25, trainers: 0.15, strength: 0.15 };

export function scoreDeck(deck: BuiltDeck): RankedDeck {
  const lineOwned = deck.cards.filter((c) => c.slot === 'line');
  const trainers = deck.cards.filter((c) => c.slot !== 'line' && c.slot !== 'energy');
  const trainerSlots = trainers.reduce((n, c) => n + c.count, 0);
  const breakdown = {
    owned: deck.ownedCopies / 60,
    line: lineOwned.filter((c) => c.owned > 0).length / Math.max(lineOwned.length, 1),
    trainers: trainerSlots ? trainers.reduce((n, c) => n + c.owned, 0) / trainerSlots : 0,
    strength: Math.min(deck.bestDamage / 200, 1),
  };
  const score =
    breakdown.owned * WEIGHTS.owned +
    breakdown.line * WEIGHTS.line +
    breakdown.trainers * WEIGHTS.trainers +
    breakdown.strength * WEIGHTS.strength;
  return { ...deck, score, breakdown };
}

/**
 * Decks the player can (mostly) build: one per attacker whose line they own
 * at least part of, best first, one deck per attacker name.
 */
export function recommendDecks(pool: Pool, owned: Owned, limit = 40): RankedDeck[] {
  const best = new Map<string, RankedDeck>();
  for (const attacker of attackerCandidates(pool)) {
    const line = resolveLine(attacker, pool, owned);
    if (!line?.some((card) => (owned.byName.get(card.name) ?? 0) > 0)) continue;
    const deck = buildDeck(attacker, pool, { owned });
    if (!deck || deck.violations.length > 0) continue;
    const ranked = scoreDeck(deck);
    const prev = best.get(attacker.name);
    if (!prev || ranked.score > prev.score) best.set(attacker.name, ranked);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Builds one 60-card list around a main attacker.
 *
 * A heuristic skeleton, not a model of how the deck plays: the attacker's
 * evolution line, Energy for its attack costs, Trainers by role, basic Energy
 * to fill. When a collection is given, owned cards come first in every slot
 * and anything else is reported as missing. The result is always checked by
 * @ptcg/rules' validateDeck, and any violation is reported, not hidden.
 */
import {
  COPY_LIMIT,
  DECK_SIZE,
  hasRuleBox,
  isAceSpec,
  isBasicPokemon,
  isPrismStar,
  sharedPokemonTypes,
  validateDeck,
  type PtcgCard,
  type Violation,
} from '@ptcg/rules';
import { NOTHING_OWNED, ownedCount, type Owned } from './collection';
import type { Pool, PoolTrainer } from './pool';
import { ROLE_TARGETS, rolesOf, type Role } from './roles';

export type Slot = 'line' | 'support' | 'energy' | Role;

export interface DeckLine {
  card: PtcgCard;
  count: number;
  /** Copies of this name (or Energy type) the player owns, capped at `count`. */
  owned: number;
  slot: Slot;
}

export interface BuiltDeck {
  attacker: PtcgCard;
  /** Basic → … → attacker. */
  line: PtcgCard[];
  energyType: string | null;
  cards: DeckLine[];
  /** Lines with fewer owned copies than the list uses. */
  missing: { card: PtcgCard; need: number }[];
  violations: Violation[];
  ownedCopies: number;
  /** Damage of the attacker's best attack, as printed (leading number). */
  bestDamage: number;
}

/** "30", "30+", "120×" → the printed number; "×20" or no damage → 0. */
export function damageValue(damage: string | undefined): number {
  const match = damage?.match(/^\d+/);
  return match ? Number(match[0]) : 0;
}

export function bestAttack(card: PtcgCard) {
  let best: NonNullable<PtcgCard['attacks']>[number] | undefined;
  for (const attack of card.attacks ?? []) {
    if (!best || damageValue(attack.damage) > damageValue(best.damage)) best = attack;
  }
  return best;
}

/**
 * The attacker's evolution line, Basic first, resolved by name through the
 * pool. Null when a link isn't legal in the format (or isn't a Pokémon at all,
 * like a Fossil Item), since the deck couldn't be built.
 */
export function resolveLine(attacker: PtcgCard, pool: Pool, owned: Owned): PtcgCard[] | null {
  const line = [attacker];
  let current = attacker;
  while (current.evolveFrom) {
    const prints = pool.pokemonByName.get(current.evolveFrom);
    if (!prints || prints.length === 0) return null;
    // Any print of the name fills the slot; prefer one the player owns, else the newest.
    const pick =
      prints.find((p) => (owned.byName.get(p.name) ?? 0) > 0) ?? prints[prints.length - 1]!; // prints is non-empty: checked above
    line.unshift(pick);
    current = pick;
    if (line.length > 3) return null; // a cycle in bad data; no real line is longer
  }
  return line;
}

/** Copies per stage, Basic first. Singleton formats run one of each. */
function lineCounts(length: number, limit: number): number[] {
  if (limit === 1) return Array.from({ length }, () => 1);
  if (length === 1) return [4];
  if (length === 2) return [4, 3];
  return [4, 2, 3];
}

/**
 * The Energy type the attacker's costs ask for most; if they're all
 * Colorless, the type the player owns most of, else the attacker's own type.
 */
export function chooseEnergyType(attacker: PtcgCard, pool: Pool, owned: Owned): string | null {
  const tally = new Map<string, number>();
  for (const attack of attacker.attacks ?? []) {
    for (const t of attack.cost) if (t !== 'Colorless') tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  const byNeed = [...tally].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const byOwned = [...owned.energyByType].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const candidates = [...byNeed, ...byOwned, ...(attacker.types ?? []), ...pool.energyTypes];
  return candidates.find((t) => pool.basicEnergy.has(t)) ?? null;
}

/** Higher is a better default pick for the role, from printed facts only. */
function trainerQuality(t: PoolTrainer, role: Role): number {
  // Reprint count stands in for "staple" — the cards a game keeps reprinting.
  let score = Math.min(t.printCount, 10);
  if (role === 'draw') {
    const drawn = t.card.effect?.match(/draws? (\d+) cards?/i);
    score += drawn ? Number(drawn[1]) : 3;
    if (t.card.trainerType === 'Supporter') score += 3;
  }
  if (role === 'pokemonSearch' && t.card.trainerType === 'Item') score += 3;
  return score;
}

/**
 * The engine's shape for a list — its own defaults, not rules. Supporters are
 * capped because only one can be played a turn; GLC runs more Energy and more
 * Pokémon, since singleton thins out every Trainer slot.
 */
const OVERFLOW_MIN_PRINTS = 3;

const SHAPE = {
  standard: { energy: 10, maxSupporters: 12, supportPokemon: 0 },
  glc: { energy: 12, maxSupporters: 14, supportPokemon: 10 },
};

export interface BuildOptions {
  owned?: Owned;
  /** Most copies of one name; 1 for Gym Leader Challenge. */
  copyLimit?: number;
}

export function buildDeck(
  attacker: PtcgCard,
  pool: Pool,
  options: BuildOptions = {},
): BuiltDeck | null {
  const owned = options.owned ?? NOTHING_OWNED;
  const limit = options.copyLimit ?? (pool.format === 'glc' ? 1 : COPY_LIMIT);
  const line = resolveLine(attacker, pool, owned);
  if (!line) return null;
  const glc = pool.format === 'glc';
  // GLC bans rule-box cards and needs every Pokémon to share a type, so a
  // line that breaks either (an ex attacker, Eevee into Vaporeon) can't be built.
  if (glc && line.some(hasRuleBox)) return null;
  if (glc && sharedPokemonTypes(line.map((card) => ({ card, count: 1 }))).length === 0) return null;

  const shape = glc ? SHAPE.glc : SHAPE.standard;
  const energyType = chooseEnergyType(attacker, pool, owned);
  const own = (card: PtcgCard) => ownedCount(owned, card, pool.energyTypes);
  const cards: DeckLine[] = [];
  const add = (card: PtcgCard, count: number, slot: Slot) => {
    if (count <= 0) return;
    cards.push({ card, count, owned: Math.min(own(card), count), slot });
  };

  lineCounts(line.length, limit).forEach((count, i) => add(line[i]!, count, 'line')); // counts has one entry per stage

  const used = new Set<string>(line.map((c) => c.name));

  // GLC: more Pokémon of the deck's type, singleton — Basics whose abilities
  // do a job first, then the hardest hitters. Owned ones first throughout.
  if (shape.supportPokemon > 0) {
    const deckType = sharedPokemonTypes(line.map((card) => ({ card, count: 1 })));
    const support = [...pool.pokemonByName.values()]
      .map((prints) => prints[prints.length - 1]!) // map values are never empty
      .filter(
        (c) =>
          !used.has(c.name) &&
          isBasicPokemon(c) &&
          !hasRuleBox(c) &&
          (c.types ?? []).some((t) => deckType.includes(t)),
      )
      .map((c) => ({
        card: c,
        jobs: rolesOf({ ...c, attacks: [] }).length,
        hit: damageValue(bestAttack(c)?.damage),
      }))
      .sort(
        (a, b) =>
          Math.min(own(b.card), 1) - Math.min(own(a.card), 1) ||
          b.jobs - a.jobs ||
          b.hit - a.hit ||
          a.card.name.localeCompare(b.card.name),
      )
      .slice(0, shape.supportPokemon);
    for (const { card } of support) {
      add(card, 1, 'support');
      used.add(card.name);
    }
  }

  const pokemonCount = cards.reduce((n, c) => n + c.count, 0);
  let trainerBudget = DECK_SIZE - pokemonCount - (energyType ? shape.energy : 0);
  let supporters = 0;
  let aceSpecUsed = false;

  const fillRole = (role: Role, want: number, minPrints = 0) => {
    const options = pool.trainers
      .filter(
        (t) =>
          t.roles.includes(role) &&
          t.printCount >= minPrints &&
          // Overflow never adds Stadiums or Tools: a deck wants a few, not a playset more.
          !(minPrints > 0 && (t.card.trainerType === 'Stadium' || t.card.trainerType === 'Tool')) &&
          !used.has(t.card.name) &&
          !(glc && hasRuleBox(t.card)) &&
          !(aceSpecUsed && isAceSpec(t.card)) &&
          !(t.card.trainerType === 'Supporter' && supporters >= shape.maxSupporters),
      )
      .sort(
        (a, b) =>
          Math.min(own(b.card), limit) - Math.min(own(a.card), limit) ||
          trainerQuality(b, role) - trainerQuality(a, role) ||
          a.card.name.localeCompare(b.card.name),
      );
    for (const t of options) {
      if (want <= 0 || trainerBudget <= 0) return;
      // One ACE SPEC per deck, one copy of a Prism Star card per name.
      const cap = isAceSpec(t.card) || isPrismStar(t.card) ? 1 : limit;
      if (isAceSpec(t.card)) {
        if (aceSpecUsed) continue;
        aceSpecUsed = true;
      }
      const supporterRoom =
        t.card.trainerType === 'Supporter' ? shape.maxSupporters - supporters : Infinity;
      const count = Math.min(cap, want, trainerBudget, supporterRoom);
      if (count <= 0) continue;
      add(t.card, count, role);
      used.add(t.card.name);
      if (t.card.trainerType === 'Supporter') supporters += count;
      want -= count;
      trainerBudget -= count;
    }
  };

  if (line.length === 3) fillRole('skipStage', limit === 1 ? 1 : 3);
  for (const [role, target] of Object.entries(ROLE_TARGETS) as [Role, number][]) {
    fillRole(role, target);
  }
  // Leftover Trainer slots go only to well-reprinted cards — a card the game
  // keeps reprinting is a staple, the rest are often marginal — searching
  // first; Energy takes whatever is still left.
  for (const role of ['pokemonSearch', 'energySearch', 'recovery', 'switch', 'draw'] as Role[]) {
    fillRole(role, trainerBudget, OVERFLOW_MIN_PRINTS);
  }

  const energyCard = energyType ? pool.basicEnergy.get(energyType) : undefined;
  const filled = cards.reduce((n, c) => n + c.count, 0);
  if (energyCard) add(energyCard, DECK_SIZE - filled, 'energy');

  const missing = cards
    .filter((c) => c.owned < c.count)
    .map((c) => ({ card: c.card, need: c.count - c.owned }));
  const violations = validateDeck(cards, pool.format, pool.catalog.legality);

  return {
    attacker,
    line,
    energyType,
    cards,
    missing,
    violations,
    ownedCopies: cards.reduce((n, c) => n + c.owned, 0),
    bestDamage: damageValue(bestAttack(attacker)?.damage),
  };
}

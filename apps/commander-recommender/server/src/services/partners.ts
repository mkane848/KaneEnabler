import type { CardRow } from '../types';

/**
 * A commander as actually played: one card, or two under a Partner-family
 * ability (702.124). Every card in `cards` is jointly "the commander" —
 * there's no primary/secondary in the rules (702.124e), so this is an array
 * rather than a "main card + optional partner" shape.
 */
export interface CommanderUnit {
  cards: CardRow[];
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function creatureTypeSet(card: CardRow): Set<string> {
  return new Set(parseJsonArray(card.creature_types));
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

/** Stable id for a unit, used to dedupe pairs regardless of which card was found first. */
export function unitKey(unit: CommanderUnit): string {
  return unit.cards
    .map((c) => c.oracle_id)
    .sort()
    .join('+');
}

/**
 * Builds every legal "commander unit" from the eligible candidate pool: one
 * per solo card, plus one per valid Partner/Partner-with/Partner—suffix/
 * Friends-forever/Choose-a-Background/Doctor's-companion pair.
 *
 * Pairing is grouped by ability variant rather than a blind cross-product
 * over every candidate — with an eligible pool in the tens to low hundreds,
 * pairing only within (or against) the relevant sub-groups keeps this cheap
 * enough to run per request, which is what was asked for. Different partner
 * variants never combine with each other (702.124f) — a plain-Partner card
 * cannot pair with a Partner-with card, for instance — which pairing only
 * within each group already guarantees.
 *
 * A card with a partner ability still gets its own solo unit too: every
 * variant here is optional (903.3 / 702.124a), so a Partner card is a
 * perfectly legal commander by itself. The one exception is Background
 * enchantments, which never appear as a solo candidate in the first place
 * (they're not a creature/Vehicle/Spacecraft, so getCommanderCandidates
 * already excludes them) and are only ever reached here as a pairing target.
 */
export function buildCommanderUnits(candidates: CardRow[], backgrounds: CardRow[]): CommanderUnit[] {
  const units: CommanderUnit[] = candidates.map((card) => ({ cards: [card] }));
  const seenPairs = new Set<string>();

  function addPair(a: CardRow, b: CardRow): void {
    if (a.oracle_id === b.oracle_id) return;
    const key = [a.oracle_id, b.oracle_id].sort().join('+');
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    units.push({ cards: [a, b] });
  }

  function pairAllWithin(group: CardRow[]): void {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) addPair(group[i], group[j]);
    }
  }

  const byAbility = (ability: CardRow['partner_ability']) =>
    candidates.filter((c) => c.partner_ability === ability);

  // Plain Partner: any two.
  pairAllWithin(byAbility('partner'));

  // Partner—[text]: only within the same suffix group.
  const suffixGroups = new Map<string, CardRow[]>();
  for (const card of byAbility('partner_suffix')) {
    const key = card.partner_target ?? '';
    const group = suffixGroups.get(key);
    if (group) group.push(card);
    else suffixGroups.set(key, [card]);
  }
  for (const group of suffixGroups.values()) pairAllWithin(group);

  // Partner with [Name]: symmetric named pairing — each card must name the
  // other (702.124j), not just be named by it.
  const byNameLower = new Map(candidates.map((c) => [c.name_lower, c]));
  for (const card of byAbility('partner_with')) {
    const target = card.partner_target ? byNameLower.get(card.partner_target) : undefined;
    if (target?.partner_ability === 'partner_with' && target.partner_target === card.name_lower) {
      addPair(card, target);
    }
  }

  // Friends forever: any two. Restricted to creatures by the rule (702.124k),
  // which every real friends-forever card already satisfies as printed —
  // checked anyway rather than assumed, since nothing stops a future card
  // from breaking that pattern.
  pairAllWithin(byAbility('friends_forever').filter((c) => (c.type_line ?? '').includes('Creature')));

  // Choose a Background: the companion card × every legal legendary Background.
  for (const chooser of byAbility('choose_background')) {
    for (const background of backgrounds) addPair(chooser, background);
  }

  // Doctor's companion: the companion card × any legendary creature whose
  // creature types are *exactly* Time Lord and Doctor — no other subtypes.
  const timeLordDoctor = new Set(['Time Lord', 'Doctor']);
  const doctors = candidates.filter((c) => setEquals(creatureTypeSet(c), timeLordDoctor));
  for (const companion of byAbility('doctors_companion')) {
    for (const doctor of doctors) addPair(companion, doctor);
  }

  return units;
}

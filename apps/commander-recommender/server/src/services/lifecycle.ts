/**
 * What an archetype needs in order to actually function.
 *
 * A deck is not a pile of cards that share a theme — it's a chain. Reanimator
 * needs something to fill the graveyard, something worth reanimating, and a
 * way to bring it back; missing the first, the reanimation spells are dead
 * cards. Aristocrats needs fodder, an outlet to sacrifice it to, and a payoff
 * for the dying. Voltron's usual failure isn't a shortage of Equipment, it's
 * that one removal spell ends the game plan.
 *
 * The roles in `signals.ts` already say what each card *does* — this file says
 * what a working deck *needs*, which is what makes "you have nine death-trigger
 * payoffs and one sacrifice outlet" expressible.
 *
 * Built on the precomputed relationships in `card_signals`, so this is
 * queryable in both directions: which slots a list fills, and which cards
 * would fill a slot it doesn't.
 */
import type { Role } from './signals';

/**
 * One requirement of a working deck: a job that needs doing, and the roles
 * that count as doing it.
 */
export interface LifecycleSlot {
  key: string;
  /** Shown to the user. Phrased as the job, not the mechanic. */
  label: string;
  /** What this slot does for the plan, in one line. */
  description: string;
  /** A card fills this slot if it has any of these roles for the archetype. */
  roles: Role[];
  /** How many cards it takes for this slot to count as filled. */
  minimum: number;
  /**
   * Marks the slot as the one most often under-built in this archetype.
   *
   * HEURISTIC, AND LOW CONFIDENCE. These flags are a judgement call about
   * which slot people typically forget — not a measured claim, and nothing
   * in the data backs them yet. They are surfaced as a hint, labelled as
   * such. Revisit once there are enough real lists to see whether any of it
   * holds up statistically; if it does, this can become a stronger claim,
   * and if it doesn't, it should go.
   */
  commonlyMissing?: boolean;
}

export interface LifecycleSpec {
  /** Matches an archetype key from `signals.ts`. */
  archetype: string;
  label: string;
  slots: LifecycleSlot[];
}

/**
 * Lifecycle specs for the archetypes that have a clear chain.
 *
 * Not every archetype gets one. Kindred and keyword-care are membership
 * groups rather than engines — "more Goblins" is not a missing slot — so
 * they are deliberately absent, and a summary of them says how deep the
 * theme runs instead.
 */
export const LIFECYCLES: LifecycleSpec[] = [
  {
    archetype: 'aristocrats',
    label: 'Aristocrats',
    slots: [
      {
        key: 'fodder',
        label: 'Fodder',
        description: 'Creatures to sacrifice, ideally ones that replace themselves.',
        roles: ['produces'],
        minimum: 3,
      },
      {
        key: 'outlet',
        label: 'Sacrifice outlet',
        description: 'A repeatable way to sacrifice them, ideally without paying mana.',
        roles: ['consumes'],
        minimum: 2,
        commonlyMissing: true,
      },
      {
        key: 'payoff',
        label: 'Death payoff',
        description: 'Something that triggers when a creature dies, turning the loss into damage or value.',
        roles: ['rewards'],
        minimum: 3,
      },
    ],
  },
  {
    archetype: 'reanimator',
    label: 'Reanimator',
    slots: [
      {
        key: 'fill',
        label: 'Graveyard filling',
        description: 'A way to get a creature into the graveyard in the first place.',
        // Self-mill is a different archetype, so this slot is filled from
        // outside its own — see `crossArchetypeSlot` below.
        roles: ['produces'],
        minimum: 2,
        commonlyMissing: true,
      },
      {
        key: 'retrieval',
        label: 'Reanimation',
        description: 'The spell or ability that puts it back onto the battlefield.',
        roles: ['rewards', 'consumes'],
        minimum: 3,
      },
    ],
  },
  {
    archetype: 'goWide',
    label: 'Go-Wide Combat',
    slots: [
      {
        key: 'tokens',
        label: 'Board building',
        description: 'Cards that put multiple bodies onto the battlefield.',
        roles: ['produces'],
        minimum: 4,
      },
      {
        key: 'payoff',
        label: 'Payoff',
        description: 'Anthems, mass pumps, and finishers that scale with how many creatures you have.',
        roles: ['rewards'],
        minimum: 3,
      },
      {
        key: 'multiplier',
        label: 'Multipliers',
        description: 'Effects that double what you make. Optional, but the ceiling of the deck.',
        roles: ['amplifies'],
        minimum: 1,
      },
    ],
  },
  {
    archetype: 'voltron',
    label: 'Voltron',
    slots: [
      {
        key: 'suit',
        label: 'Equipment & Auras',
        description: 'The buffs themselves.',
        roles: ['is', 'produces'],
        minimum: 4,
      },
      {
        key: 'payoff',
        label: 'Payoffs',
        description: 'Cards that reward having a suited-up creature.',
        roles: ['rewards'],
        minimum: 2,
        commonlyMissing: true,
      },
    ],
  },
  {
    archetype: 'landsMatter',
    label: 'Lands Matter',
    slots: [
      {
        key: 'drops',
        label: 'Extra land drops',
        description: 'Ways to put more lands onto the battlefield than one a turn.',
        roles: ['produces'],
        minimum: 3,
      },
      {
        key: 'payoff',
        label: 'Landfall payoffs',
        description: 'Cards that trigger on lands entering, or scale with how many you control.',
        roles: ['rewards'],
        minimum: 3,
      },
    ],
  },
  {
    archetype: 'spellslinger',
    label: 'Spellslinger',
    slots: [
      {
        key: 'payoff',
        label: 'Payoffs',
        description: 'Cards that reward casting instants and sorceries.',
        roles: ['rewards'],
        minimum: 3,
      },
      {
        key: 'multiplier',
        label: 'Copy effects',
        description: 'Ways to cast a spell twice. Optional, but where the deck gets explosive.',
        roles: ['amplifies'],
        minimum: 1,
      },
    ],
  },
  {
    archetype: 'counters',
    label: '+1/+1 Counters',
    slots: [
      {
        key: 'place',
        label: 'Counter placement',
        description: 'Cards that put +1/+1 counters onto creatures.',
        roles: ['produces'],
        minimum: 4,
      },
      {
        key: 'payoff',
        label: 'Payoffs',
        description: 'Cards that read how many counters are out there.',
        roles: ['rewards'],
        minimum: 2,
        commonlyMissing: true,
      },
    ],
  },
];

/**
 * Slots whose cards come from a *different* archetype than the one they
 * serve.
 *
 * Reanimator's graveyard-filling is the case this exists for: nothing in the
 * Reanimator archetype fills a graveyard — Entomb and Buried Alive are
 * Self-Mill cards. Without this, a list holding every reanimation spell in
 * the format and no way to fill a graveyard would look complete.
 */
const CROSS_ARCHETYPE_SLOTS: Record<string, { archetype: string; roles: Role[] }> = {
  'reanimator.fill': { archetype: 'selfMill', roles: ['produces'] },
};

export function crossArchetypeSlot(
  archetype: string,
  slotKey: string
): { archetype: string; roles: Role[] } | undefined {
  return CROSS_ARCHETYPE_SLOTS[`${archetype}.${slotKey}`];
}

export function lifecycleFor(archetype: string): LifecycleSpec | undefined {
  return LIFECYCLES.find((spec) => spec.archetype === archetype);
}

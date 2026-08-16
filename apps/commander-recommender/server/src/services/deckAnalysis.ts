/**
 * What the submitted list is trying to do, before any commander is involved.
 *
 * Everything else in this app answers "which commander fits these cards?".
 * This answers "what deck is this, and what is it missing?" — which is a
 * different question, and one the user can act on without picking a commander
 * at all.
 *
 * Both outputs come off the same pass:
 *
 *   - **Themes** — the strongest archetypes in the list, ranked by how many
 *     cards actually back them.
 *   - **Packages** — for each of those, whether the archetype's lifecycle is
 *     complete, and which slot is thin if not. This is the useful half: "you
 *     have nine death-trigger payoffs and one sacrifice outlet" is a
 *     diagnosis, where "you have 12 Aristocrats cards" is just a count.
 */
import { hasActiveRole, type Role, type SignalMatch } from './signals';
import { crossArchetypeSlot, lifecycleFor, type LifecycleSlot } from './lifecycle';
import type { OwnedCard, SupportingCard } from './synergy';

/** One card's contribution, with the roles it plays in this archetype. */
export interface SlotCard extends SupportingCard {
  roles: Role[];
}

/**
 * A card the list does not have, offered to fill a slot it cannot.
 *
 * Filled in by `packages.ts` — `analyzeDeck` itself only reports what the
 * submitted list contains, and leaves this empty.
 */
export interface SlotSuggestion extends SupportingCard {
  oracleId: string;
  /** Labels of the list's *other* themes this card also plays into. */
  alsoFits: string[];
}

export interface SlotStatus {
  key: string;
  label: string;
  description: string;
  /** Cards from the list filling this slot. */
  cards: SlotCard[];
  /** Cards that would fill it, when it is short. Empty otherwise. */
  suggestions: SlotSuggestion[];
  /** How many it takes for the slot to count as filled. */
  minimum: number;
  filled: boolean;
  /**
   * Whether this is the slot the archetype usually lacks.
   *
   * A hint, not a measurement — see `LifecycleSlot.commonlyMissing`. The UI
   * must present it as a guess.
   */
  commonlyMissing: boolean;
}

export interface DeckTheme {
  archetype: string;
  /** The subtype or keyword this theme is restricted to, where it has one. */
  qualifier?: string;
  label: string;
  description: string;
  /** Distinct cards in the list participating in this archetype at all. */
  cardCount: number;
  /** Cards, most-involved first. */
  cards: SlotCard[];
  /** Present only for archetypes with a lifecycle — kindred has no chain. */
  slots: SlotStatus[];
  /** True when every non-optional slot is filled. */
  complete: boolean;
}

export interface DeckAnalysis {
  themes: DeckTheme[];
}

/** How many themes to report. Beyond this it stops being a summary. */
const MAX_THEMES = 6;

/** A theme needs at least this many distinct cards to be worth naming. Same
 * reasoning as the signal threshold in scoring: fewer than this is a
 * coincidence, not a pattern. */
const MIN_THEME_CARDS = 3;

interface Participation {
  entry: OwnedCard;
  roles: Role[];
}

/**
 * Whether a card counts toward its theme, or merely happens to touch it.
 *
 * Everywhere else, "cares, not shares" is applied to the commander. It has to
 * apply here too, for the same reason: a graveyard list with four fliers in it
 * reported a five-card *Flying* theme, which is not a theme, it's a
 * coincidence of evasion. A keyword is only a plan when something in the list
 * grants it or triggers off it.
 *
 * Kindred is deliberately exempt. Membership genuinely is a deck theme — "you
 * have five Zombies" is worth knowing and worth building toward, where "you
 * have five fliers" is not.
 */
function countsTowardTheme(archetype: string, roles: Role[]): boolean {
  return archetype !== 'keywordCare' || hasActiveRole(roles);
}

/**
 * Groups the list's cards by the archetype they participate in.
 *
 * Qualified signals (kindred, keyword-care, subtype-restricted payoffs) are
 * grouped by their full key, so "Goblin Kindred" and "Elf Kindred" are
 * separate themes rather than one lumpy "kindred".
 */
function groupByTheme(
  owned: OwnedCard[],
  signalsByCard: Map<string, SignalMatch[]>
): Map<string, { signal: SignalMatch; participants: Participation[] }> {
  const groups = new Map<string, { signal: SignalMatch; participants: Participation[] }>();

  for (const entry of owned) {
    const signals = signalsByCard.get(entry.row.oracle_id) ?? [];
    for (const signal of signals) {
      if (!countsTowardTheme(signal.archetype, signal.roles)) continue;
      const key = signal.qualifier ? `${signal.archetype}:${signal.qualifier}` : signal.archetype;
      let group = groups.get(key);
      if (!group) {
        group = { signal, participants: [] };
        groups.set(key, group);
      }
      group.participants.push({ entry, roles: signal.roles });
    }
  }

  return groups;
}

function toSlotCard({ entry, roles }: Participation): SlotCard {
  const { row, quantity } = entry;
  return {
    name: row.name,
    quantity,
    typeLine: row.type_line,
    isGameChanger: !!row.game_changer,
    manaValue: row.cmc,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    backImageUri: row.back_image_uri ?? null,
    backName: row.back_name ?? null,
    scryfallUri: row.scryfall_uri,
    roles,
  };
}

/** Curve order, matching how supporting cards are listed elsewhere. */
function byCurveThenName(a: SlotCard, b: SlotCard): number {
  const aValue = a.manaValue ?? Number.POSITIVE_INFINITY;
  const bValue = b.manaValue ?? Number.POSITIVE_INFINITY;
  if (aValue !== bValue) return aValue - bValue;
  return a.name.localeCompare(b.name);
}

/**
 * Fills in one archetype's lifecycle from the cards backing it.
 *
 * A card can fill more than one slot — Lathril both makes Elves and spends
 * them — which is correct rather than double-counting: the question each slot
 * asks is "can this deck do X?", and one card doing two jobs genuinely
 * answers both.
 */
function buildSlots(
  slots: LifecycleSlot[],
  archetype: string,
  participants: Participation[],
  groups: Map<string, { signal: SignalMatch; participants: Participation[] }>
): SlotStatus[] {
  return slots.map((slot) => {
    // Most slots draw from the archetype's own cards. A few are filled by a
    // different archetype entirely — Reanimator's graveyard-filling comes
    // from Self-Mill, because nothing in Reanimator itself fills a graveyard.
    const cross = crossArchetypeSlot(archetype, slot.key);
    const pool = cross ? (groups.get(cross.archetype)?.participants ?? []) : participants;
    const wantedRoles = cross ? cross.roles : slot.roles;

    const cards = pool
      .filter((p) => p.roles.some((role) => wantedRoles.includes(role)))
      .map(toSlotCard)
      .sort(byCurveThenName);

    return {
      key: slot.key,
      label: slot.label,
      description: slot.description,
      cards,
      suggestions: [],
      minimum: slot.minimum,
      filled: cards.length >= slot.minimum,
      commonlyMissing: slot.commonlyMissing ?? false,
    };
  });
}

/**
 * The strongest things this list is doing, and whether each one works.
 *
 * `signalsByCard` comes from the precomputed relationship layer, so this
 * derives nothing itself — it reads the same rows the commander scorer does.
 */
export function analyzeDeck(
  owned: OwnedCard[],
  signalsByCard: Map<string, SignalMatch[]>
): DeckAnalysis {
  const groups = groupByTheme(owned, signalsByCard);

  const themes: DeckTheme[] = [];
  for (const [, group] of groups) {
    // Distinct cards, not summed quantity — the same rule the rest of the
    // engine uses, and the reason ten copies of one card can't look like a
    // theme.
    const distinct = new Map(group.participants.map((p) => [p.entry.row.oracle_id, p]));
    if (distinct.size < MIN_THEME_CARDS) continue;

    const spec = lifecycleFor(group.signal.archetype);
    const participants = [...distinct.values()];
    const slots = spec ? buildSlots(spec.slots, group.signal.archetype, participants, groups) : [];

    themes.push({
      archetype: group.signal.archetype,
      qualifier: group.signal.qualifier,
      label: group.signal.label,
      description: group.signal.description,
      cardCount: distinct.size,
      cards: participants.map(toSlotCard).sort(byCurveThenName),
      slots,
      // An archetype with no lifecycle spec is never "incomplete" — there is
      // no chain to break. Saying otherwise would invent a problem.
      complete: slots.length === 0 || slots.every((s) => s.filled),
    });
  }

  themes.sort((a, b) => b.cardCount - a.cardCount || a.label.localeCompare(b.label));
  return { themes: themes.slice(0, MAX_THEMES) };
}

/** A time-counter mechanic this app knows how to auto-adjust. */
export type Mechanic = 'suspend' | 'vanishing' | 'fading' | 'custom';

/** Which way a mechanic's counters move each turn. */
export type Direction = 'increment' | 'decrement';

/**
 * Card data as generated from Scryfall (see scripts/fetch-card-data.mjs).
 * Only fields the UI actually reads are carried — across ~16k cards, unused
 * fields cost megabytes.
 */
export interface CardData {
  id: string;
  name: string;
  manaCost?: string;
  typeLine?: string;
  /** Kept only for cards with a time-counter mechanic; it feeds detectMechanic. */
  oracleText?: string;
  imageSmall?: string;
  /** Commander color identity (colors + any color symbols in rules/cost text). */
  colorIdentity?: string[];
  artist?: string;
}

/** A card instance currently being tracked on the board/in exile. */
export interface TrackedCard {
  /** Unique per instance added, so the same card can be tracked more than once. */
  instanceId: string;
  cardId: string;
  name: string;
  imageSmall?: string;
  mechanic: Mechanic;
  /** Label shown for mechanic === 'custom', e.g. "Age counter". */
  customLabel?: string;
  count: number;
  startingCount: number;
  /**
   * Which way this card's counters move on Next Turn. Suspend, Vanishing,
   * and Fading are always decrement; Custom can go either way (an
   * increment counter is still a time counter — the Time Travel keyword
   * action can add one to a suspended card or a Vanishing/Fading permanent).
   */
  direction: Direction;
  /**
   * The count that triggers this card's final ability — 0 is implicit for
   * decrement mechanics and not stored. For an increment Custom counter this
   * is the count that resolves it; undefined means open-ended.
   */
  targetCount?: number;
  /** Whether this card's count changes automatically on Next Turn. */
  autoAdjust: boolean;
  /** What happens at the target count, shown to the player. */
  resolveNote: string;
  turnAdded: number;
}

/** One card's count change from a single Next Turn action. */
export interface TurnChange {
  instanceId: string;
  name: string;
  mechanic: Mechanic;
  from: number;
  to: number;
  hitTarget: boolean;
  resolveNote: string;
}

export interface GameState {
  turn: number;
  cards: TrackedCard[];
}

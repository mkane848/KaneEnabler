/** A time-counter mechanic this app knows how to auto-adjust. */
export type Mechanic = 'suspend' | 'vanishing' | 'fading' | 'saga' | 'level' | 'custom';

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
  /** Which way this card's counters move on Time Travel. */
  direction: Direction;
  /**
   * The count that triggers this card's final ability — 0 is implicit for
   * decrement mechanics and not stored. For increment mechanics this is the
   * chapter/level that sacrifices or otherwise resolves the card; undefined
   * means open-ended (e.g. Level Up creatures, which never auto-resolve).
   */
  targetCount?: number;
  /** Whether this card's count changes automatically on Time Travel. */
  autoAdjust: boolean;
  /** What happens at the target count, shown to the player. */
  resolveNote: string;
  turnAdded: number;
}

/** One card's count change from a single Time Travel action. */
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

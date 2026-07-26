/** A time-counter mechanic this app knows how to auto-adjust. */
export type Mechanic = 'suspend' | 'vanishing' | 'fading' | 'custom';

/** Which way a mechanic's counters move each turn. */
export type Direction = 'increment' | 'decrement';

/**
 * Visual theme. 'who' (Doctor Who skin) is the default; 'claude' is the
 * app's original styling, kept as a selectable option rather than replaced.
 */
export type Theme = 'claude' | 'who';

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
  /**
   * A token created by another card's effect (e.g. the Human Noble token
   * from The Girl in the Fireplace) rather than a card in its own right —
   * it won't be in the Scryfall catalog, so it's always named by hand.
   */
  isToken?: boolean;
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
  /** A token created by an effect rather than a card of its own — see CardData.isToken. */
  isToken?: boolean;
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

/** One card's count change within a game-log entry (Next Turn, a Time Travel pass). */
export interface LogChange {
  name: string;
  mechanic: Mechanic;
  from: number;
  to: number;
}

/**
 * One row in the game log — every effect that changed something, in the
 * order it happened. Multi-card events (Next Turn, a Time Travel pass) carry
 * a `changes` list; single-card or metadata events (adding a card, a manual
 * edit, changing the turn number) use `detail` instead.
 */
export interface LogEntry {
  id: string;
  /** The turn this happened on — Next Turn entries use the turn just arrived at. */
  turn: number;
  /** Wall-clock time, for stable ordering within a turn. */
  timestamp: number;
  title: string;
  detail?: string;
  changes?: LogChange[];
}

export interface GameState {
  turn: number;
  cards: TrackedCard[];
  log: LogEntry[];
}

/**
 * A counter mechanic this app knows how to auto-adjust. Suspend and
 * Vanishing use real time counters; Fading uses fade counters (a distinct
 * counter type, rule 702.32) even though it's tracked the same way in this
 * UI; Saga uses lore counters and advances on a different turn step
 * entirely (precombat main, not upkeep) — see `TIME_COUNTER_MECHANICS` and
 * `turnStepForMechanic` in `@mtg/rules`.
 */
export type Mechanic = 'suspend' | 'vanishing' | 'fading' | 'saga' | 'custom';

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
  /**
   * Saga chapter text, one entry per chapter (index 0 = chapter I). Only
   * set for mechanic === 'saga'. `targetCount` is always `chapters.length`
   * for a Saga — the lore counter that triggers the final chapter and
   * causes it to be sacrificed once that chapter resolves.
   */
  chapters?: string[];
  /** Chapter numbers (1-based) whose ability has already triggered, so a chapter isn't shown as pending after it's fired. */
  triggeredChapters?: number[];
  /**
   * Fading only (rule 702.32b): true once an upkeep has actually failed to
   * remove a fade counter — the real sacrifice trigger. A Fading card at
   * count 0 that hasn't reached that upkeep yet is *not* exhausted; it gets
   * one more upkeep first (Fading N survives N+1 upkeeps, unlike Vanishing
   * N's exactly N). See hasHitTarget in utils/counters.ts.
   */
  fadeExhausted?: boolean;
}

/** Which turn step produced a given change — Suspend/Vanishing/Fading tick down at upkeep; Sagas gain a lore counter as precombat main begins. */
export type TurnStep = 'upkeep' | 'precombatMain';

/** One card's count change from a single Next Turn action. */
export interface TurnChange {
  instanceId: string;
  name: string;
  mechanic: Mechanic;
  step: TurnStep;
  from: number;
  to: number;
  hitTarget: boolean;
  resolveNote: string;
  /** Saga only: the chapter ability that just triggered this change, if any. */
  chapter?: { number: number; text: string };
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

/**
 * Per-commander bookkeeping that doesn't fit the tracked-cards board: the
 * command-zone tax accumulates for the whole game regardless of what
 * happens on the battlefield, and Rose Tyler's Bad Wolf time counters are a
 * property of the commander card itself, not a card someone chose to add.
 */
export interface CommanderState {
  /** Times cast from the command zone this game (rule 903.10) — next cast costs an extra {2} per previous cast. */
  castCount: number;
  /** Whether this commander is currently on the battlefield — shown as a card on the board when true. Casting always sets this; it doesn't affect castCount, which persists for the whole game regardless of zone changes. */
  onBattlefield: boolean;
}

/** Rose Tyler additionally carries real time counters from her own Bad Wolf trigger — she gets +1/+1 per counter. */
export interface RoseTylerState extends CommanderState {
  timeCounters: number;
}

export interface Commanders {
  tenthDoctor: CommanderState;
  roseTyler: RoseTylerState;
}

export type CommanderId = keyof Commanders;

export interface GameState {
  turn: number;
  cards: TrackedCard[];
  log: LogEntry[];
  commanders: Commanders;
}

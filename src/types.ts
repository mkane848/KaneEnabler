/** A time-counter mechanic this app knows how to auto-decrement. */
export type Mechanic = 'suspend' | 'vanishing' | 'fading' | 'custom';

/** Card data as bundled from Scryfall (see scripts/fetch-card-data.mjs). */
export interface CardData {
  id: string;
  name: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  oracleText?: string;
  imageSmall?: string;
  imageNormal?: string;
  colors?: string[];
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
  imageNormal?: string;
  mechanic: Mechanic;
  /** Label shown for mechanic === 'custom', e.g. "Age counter". */
  customLabel?: string;
  count: number;
  startingCount: number;
  /** Whether this card loses a counter automatically on Next Turn. */
  autoDecrement: boolean;
  /** What to do when the count hits 0, shown to the player. */
  resolveNote: string;
  turnAdded: number;
}

/** One card's count change from a single Next Turn action. */
export interface TurnChange {
  instanceId: string;
  name: string;
  from: number;
  to: number;
  hitZero: boolean;
  resolveNote: string;
}

export interface GameState {
  turn: number;
  cards: TrackedCard[];
}

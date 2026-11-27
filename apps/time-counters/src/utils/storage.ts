import type { Direction, GameState, Mechanic, TrackedCard } from '../types';

const KEY = 'mtg-time-tracker:game-state:v1';

const MECHANICS: ReadonlySet<Mechanic> = new Set([
  'suspend',
  'vanishing',
  'fading',
  'saga',
  'custom',
]);
const DIRECTIONS: ReadonlySet<Direction> = new Set(['increment', 'decrement']);

/**
 * A malformed TrackedCard (from a hand-edited save, a future field this
 * version doesn't know, or plain corruption) used to pass the shallow
 * `Array.isArray(cards)` check and then crash CardTile on a missing field.
 * This checks every field CardTile and the counter logic actually read.
 */
function isValidTrackedCard(value: unknown): value is TrackedCard {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.instanceId === 'string' &&
    typeof c.cardId === 'string' &&
    typeof c.name === 'string' &&
    typeof c.mechanic === 'string' &&
    MECHANICS.has(c.mechanic as Mechanic) &&
    typeof c.count === 'number' &&
    typeof c.startingCount === 'number' &&
    typeof c.direction === 'string' &&
    DIRECTIONS.has(c.direction as Direction) &&
    typeof c.autoAdjust === 'boolean' &&
    typeof c.resolveNote === 'string' &&
    typeof c.turnAdded === 'number' &&
    (c.imageSmall === undefined || typeof c.imageSmall === 'string') &&
    (c.customLabel === undefined || typeof c.customLabel === 'string') &&
    (c.targetCount === undefined || typeof c.targetCount === 'number') &&
    (c.isToken === undefined || typeof c.isToken === 'boolean') &&
    (c.chapters === undefined ||
      (Array.isArray(c.chapters) && c.chapters.every((x) => typeof x === 'string'))) &&
    (c.triggeredChapters === undefined ||
      (Array.isArray(c.triggeredChapters) &&
        c.triggeredChapters.every((x) => typeof x === 'number'))) &&
    (c.fadeExhausted === undefined || typeof c.fadeExhausted === 'boolean')
  );
}

/**
 * Validates and migrates one serialized game. Shared by the initial load and
 * by another tab's writes (see subscribeToExternalChanges), so a save from a
 * tab running an older build passes through the same checks and migrations
 * as one read on startup.
 */
export function parseState(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as GameState;
    if (typeof parsed.turn !== 'number' || !Array.isArray(parsed.cards)) return null;
    const validCards = parsed.cards.filter(isValidTrackedCard);
    if (validCards.length !== parsed.cards.length) {
      console.warn(
        `mtg-time-tracker: dropped ${parsed.cards.length - validCards.length} corrupted card(s) from a saved game.`,
      );
    }
    parsed.cards = validCards;
    // Games saved before the game log existed won't have this field.
    if (!Array.isArray(parsed.log)) parsed.log = [];
    // Games saved before commander tax/Bad Wolf tracking won't have this field.
    if (!parsed.commanders) {
      parsed.commanders = {
        tenthDoctor: { castCount: 0, onBattlefield: false },
        roseTyler: { castCount: 0, timeCounters: 0, onBattlefield: false },
      };
    }
    // Games saved before a commander's battlefield presence was tracked won't have this field.
    if (typeof parsed.commanders.tenthDoctor.onBattlefield !== 'boolean') {
      parsed.commanders.tenthDoctor.onBattlefield = false;
    }
    if (typeof parsed.commanders.roseTyler.onBattlefield !== 'boolean') {
      parsed.commanders.roseTyler.onBattlefield = false;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseState(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    const raw = JSON.stringify(state);
    // Skipping an unchanged write is what stops two tabs echoing a game back
    // and forth: a tab that has just adopted another tab's save re-renders
    // with that same game, and rewriting identical JSON would fire a
    // `storage` event straight back at the tab it came from.
    if (localStorage.getItem(KEY) === raw) return;
    localStorage.setItem(KEY, raw);
  } catch {
    // Private browsing / quota issues — tracking still works for this session.
  }
}

/**
 * Calls `onChange` whenever another tab saves or clears the game. `null`
 * means the other tab reset it (or storage was cleared outright). The
 * browser only fires `storage` in tabs *other* than the writer, so a tab
 * never hears its own saves.
 *
 * A save that fails validation is reported as `null` too — the same answer
 * loadState gives for it on a reload — rather than being ignored, which would
 * leave this tab silently diverged from what storage holds.
 */
export function subscribeToExternalChanges(
  onChange: (state: GameState | null) => void,
): () => void {
  const listener = (event: StorageEvent) => {
    // `key === null` is localStorage.clear(), which takes the game with it.
    if (event.key !== KEY && event.key !== null) return;
    if (event.storageArea !== null && event.storageArea !== localStorage) return;
    onChange(event.newValue ? parseState(event.newValue) : null);
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

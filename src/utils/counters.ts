import type { Direction, Mechanic } from '../types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Roman numerals as high as any printed Saga's final chapter goes, with headroom. */
const ROMAN_NUMBERS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

function parseCount(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isNaN(n)) return n;
  return WORD_NUMBERS[raw.toLowerCase()] ?? null;
}

export interface Detection {
  mechanic: Mechanic;
  direction: Direction;
  /** Null when the count is variable (e.g. "Suspend X") and needs manual entry. */
  count: number | null;
  /** The count that triggers the final ability, when the mechanic defines one. */
  targetCount?: number;
}

/**
 * Looks for a known time-counter keyword in a card's oracle text.
 * Returns null if nothing recognized was found — the player can still
 * pick a mechanic and starting count manually.
 */
export function detectMechanic(oracleText?: string): Detection | null {
  if (!oracleText) return null;

  const suspend = oracleText.match(/Suspend (\d+|X)\b/i);
  if (suspend) {
    const raw = suspend[1];
    return {
      mechanic: 'suspend',
      direction: 'decrement',
      count: raw.toUpperCase() === 'X' ? null : parseCount(raw),
    };
  }

  const vanishingKeyword = oracleText.match(/Vanishing(?:\s+(\d+))?\b/i);
  if (vanishingKeyword) {
    return {
      mechanic: 'vanishing',
      direction: 'decrement',
      count: vanishingKeyword[1] ? parseCount(vanishingKeyword[1]) : null,
    };
  }
  const vanishingReminder = oracleText.match(/enters(?: the battlefield)? with (\w+) time counters? on it/i);
  if (vanishingReminder) {
    return { mechanic: 'vanishing', direction: 'decrement', count: parseCount(vanishingReminder[1]) };
  }

  const fading = oracleText.match(/Fading (\d+)\b/i);
  if (fading) {
    return { mechanic: 'fading', direction: 'decrement', count: parseCount(fading[1]) };
  }

  // Saga's reminder text has read "...add a lore counter. Sacrifice after
  // <chapter>." on every printing since the mechanic's debut (Dominaria,
  // 2018) — the trailing "Sacrifice after N." is a reliable, stable signal.
  // A Saga already has its first lore counter and chapter I has already
  // triggered by the time a player would add it to this tracker, so the
  // starting count is 1, not 0.
  const saga = oracleText.match(/lore counters?\.\s*Sacrifice after (\w+)\.\)/i);
  if (saga) {
    const target = ROMAN_NUMBERS[saga[1].toLowerCase()] ?? parseCount(saga[1]);
    return {
      mechanic: 'saga',
      direction: 'increment',
      count: 1,
      targetCount: target ?? undefined,
    };
  }

  // Level Up creatures always start at 0 level counters. There's no fixed
  // cap to detect — thresholds like "LEVEL 6+" are printed as separate
  // ability text, not a single sacrifice-at-N the way Suspend/Saga have —
  // and leveling up is a paid activated ability, not a turn-based trigger,
  // so this is manual-only (autoAdjust defaults to false for it elsewhere).
  const levelUp = oracleText.match(/Level up\b/i);
  if (levelUp) {
    return { mechanic: 'level', direction: 'increment', count: 0 };
  }

  return null;
}

/** Short, mechanic-specific description of what happens at the target count. */
export function defaultResolveNote(mechanic: Mechanic): string {
  switch (mechanic) {
    case 'suspend':
      return 'Cast it for free from exile (ignore timing restrictions).';
    case 'vanishing':
    case 'fading':
      return 'Sacrifice this permanent.';
    case 'saga':
      return 'Final chapter ability resolves, then sacrifice this Saga.';
    case 'level':
      return '';
    default:
      return 'Check this card for what happens now.';
  }
}

/** Short heading for the "ready" callout — what kind of trigger this is. */
export function triggerLabel(mechanic: Mechanic): string {
  switch (mechanic) {
    case 'suspend':
      return 'Ready to cast';
    case 'vanishing':
    case 'fading':
      return 'Ready to sacrifice';
    case 'saga':
      return 'Final chapter';
    default:
      return 'Ready to resolve';
  }
}

/**
 * The "what happens at N" field's label, tailored to how this card's counter
 * resolves. Decrement mechanics always end at 0. Increment mechanics with a
 * known target (Saga) name it; open-ended ones (Level Up, freeform custom
 * growth) have no single trigger point, so the field becomes free-form notes.
 */
export function resolveFieldLabel(direction: Direction, targetCount?: number): string {
  if (direction === 'decrement') return 'What happens at 0';
  if (targetCount != null) return `What happens at ${targetCount}`;
  return 'Notes (optional)';
}

export const MECHANIC_LABEL: Record<Mechanic, string> = {
  suspend: 'Suspend',
  vanishing: 'Vanishing',
  fading: 'Fading',
  saga: 'Saga',
  level: 'Level Up',
  custom: 'Custom',
};

export const MECHANIC_COLOR: Record<Mechanic, string> = {
  suspend: 'var(--mechanic-suspend)',
  vanishing: 'var(--mechanic-vanishing)',
  fading: 'var(--mechanic-fading)',
  saga: 'var(--mechanic-saga)',
  level: 'var(--mechanic-level)',
  custom: 'var(--mechanic-custom)',
};

/** Fixed defaults for the mechanics this app has built-in rules for. */
const BUILTIN_DIRECTION: Record<Exclude<Mechanic, 'custom'>, Direction> = {
  suspend: 'decrement',
  vanishing: 'decrement',
  fading: 'decrement',
  saga: 'increment',
  level: 'increment',
};

/** The fixed direction for a built-in mechanic; 'custom' has no fixed direction, so this defaults it. */
export function mechanicDirection(mechanic: Mechanic, fallback: Direction = 'decrement'): Direction {
  return mechanic === 'custom' ? fallback : BUILTIN_DIRECTION[mechanic];
}

/** Whether this mechanic normally changes on its own each turn. */
export function defaultAutoAdjust(mechanic: Mechanic): boolean {
  // Leveling up costs mana and is a choice, not a turn-based trigger.
  return mechanic !== 'level';
}

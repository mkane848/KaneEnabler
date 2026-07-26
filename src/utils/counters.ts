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
    default:
      return 'Ready to resolve';
  }
}

/**
 * The "what happens at N" field's label, tailored to how this card's counter
 * resolves. Decrement mechanics always end at 0. An increment Custom counter
 * with a known target names it; an open-ended one has no single trigger
 * point, so the field becomes free-form notes.
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
  custom: 'Custom',
};

export const MECHANIC_COLOR: Record<Mechanic, string> = {
  suspend: 'var(--mechanic-suspend)',
  vanishing: 'var(--mechanic-vanishing)',
  fading: 'var(--mechanic-fading)',
  custom: 'var(--mechanic-custom)',
};

/** Fixed defaults for the mechanics this app has built-in rules for — all three are decrement-to-0. */
const BUILTIN_DIRECTION: Record<Exclude<Mechanic, 'custom'>, Direction> = {
  suspend: 'decrement',
  vanishing: 'decrement',
  fading: 'decrement',
};

/** The fixed direction for a built-in mechanic; 'custom' has no fixed direction, so this defaults it. */
export function mechanicDirection(mechanic: Mechanic, fallback: Direction = 'decrement'): Direction {
  return mechanic === 'custom' ? fallback : BUILTIN_DIRECTION[mechanic];
}

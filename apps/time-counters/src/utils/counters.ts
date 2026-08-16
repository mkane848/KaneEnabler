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
    case 'saga':
      return 'Final chapter resolves, then sacrifice this Saga.';
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
 * Mechanics that use real *time counters* — the object Time Travel and
 * Rose Tyler's Bad Wolf both care about. Fading uses fade counters (rule
 * 702.32) and Saga uses lore counters — neither is a time counter, so both
 * are excluded here even though this app auto-adjusts them the same way.
 */
export const TIME_COUNTER_MECHANICS: readonly Mechanic[] = ['suspend', 'vanishing'];

export function usesTimeCounters(mechanic: Mechanic): boolean {
  return TIME_COUNTER_MECHANICS.includes(mechanic);
}

/** Which turn step auto-adjusts a given mechanic's counter — see TurnStep in types.ts. */
export function turnStepForMechanic(mechanic: Mechanic): 'upkeep' | 'precombatMain' {
  return mechanic === 'saga' ? 'precombatMain' : 'upkeep';
}

/** Ordinal chapter numbers as Magic prints them, for chapter-ability labels. */
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export function chapterRoman(chapterNumber: number): string {
  return ROMAN_NUMERALS[chapterNumber - 1] ?? String(chapterNumber);
}

/**
 * Which chapter abilities newly trigger when a Saga's lore count moves from
 * `from` to `to` — normally just one (a lore counter is added one at a
 * time), but this stays correct if a manual edit or Time Travel jumps the
 * count by more than one. Chapters already in `triggered` are skipped so a
 * manual edit that dips down and back up can't refire one.
 */
export function newlyTriggeredChapters(
  chapters: string[],
  from: number,
  to: number,
  triggered: number[] = [],
): { number: number; text: string }[] {
  const result: { number: number; text: string }[] = [];
  for (let n = Math.max(from, 0) + 1; n <= to; n++) {
    if (n > chapters.length || triggered.includes(n)) continue;
    result.push({ number: n, text: chapters[n - 1] });
  }
  return result;
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
  saga: 'Saga',
  custom: 'Custom',
};

export const MECHANIC_COLOR: Record<Mechanic, string> = {
  suspend: 'var(--mechanic-suspend)',
  vanishing: 'var(--mechanic-vanishing)',
  fading: 'var(--mechanic-fading)',
  saga: 'var(--mechanic-saga)',
  custom: 'var(--mechanic-custom)',
};

/** Fixed defaults for the mechanics this app has built-in rules for. Suspend/Vanishing/Fading count down to 0; Saga counts up to its final chapter. */
const BUILTIN_DIRECTION: Record<Exclude<Mechanic, 'custom'>, Direction> = {
  suspend: 'decrement',
  vanishing: 'decrement',
  fading: 'decrement',
  saga: 'increment',
};

/** The fixed direction for a built-in mechanic; 'custom' has no fixed direction, so this defaults it. */
export function mechanicDirection(mechanic: Mechanic, fallback: Direction = 'decrement'): Direction {
  return mechanic === 'custom' ? fallback : BUILTIN_DIRECTION[mechanic];
}

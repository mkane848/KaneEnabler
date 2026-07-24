import type { Mechanic } from '../types';

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
  /** Null when the count is variable (e.g. "Suspend X") and needs manual entry. */
  count: number | null;
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
    return { mechanic: 'suspend', count: raw.toUpperCase() === 'X' ? null : parseCount(raw) };
  }

  const vanishingKeyword = oracleText.match(/Vanishing(?:\s+(\d+))?\b/i);
  if (vanishingKeyword) {
    return { mechanic: 'vanishing', count: vanishingKeyword[1] ? parseCount(vanishingKeyword[1]) : null };
  }
  const vanishingReminder = oracleText.match(/enters(?: the battlefield)? with (\w+) time counters? on it/i);
  if (vanishingReminder) {
    return { mechanic: 'vanishing', count: parseCount(vanishingReminder[1]) };
  }

  const fading = oracleText.match(/Fading (\d+)\b/i);
  if (fading) {
    return { mechanic: 'fading', count: parseCount(fading[1]) };
  }

  return null;
}

export function defaultResolveNote(mechanic: Mechanic): string {
  switch (mechanic) {
    case 'suspend':
      return 'Cast it for free from exile (ignore timing restrictions).';
    case 'vanishing':
      return 'Sacrifice this permanent.';
    case 'fading':
      return 'Sacrifice this permanent.';
    default:
      return 'Check this card for what happens now.';
  }
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

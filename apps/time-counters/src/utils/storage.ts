import type { GameState } from '../types';

const KEY = 'mtg-time-tracker:game-state:v1';

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (typeof parsed.turn !== 'number' || !Array.isArray(parsed.cards)) return null;
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

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing / quota issues — tracking still works for this session.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

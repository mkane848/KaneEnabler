import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { clearState, loadState, saveState } from './storage';

const KEY = 'mtg-time-tracker:game-state:v1';

const FRESH_COMMANDERS = {
  tenthDoctor: { castCount: 0, onBattlefield: false },
  roseTyler: { castCount: 0, timeCounters: 0, onBattlefield: false },
};

describe('storage', () => {
  it('round-trips a saved game state', () => {
    const state: GameState = {
      turn: 5,
      cards: [],
      log: [],
      commanders: {
        tenthDoctor: { castCount: 1, onBattlefield: true },
        roseTyler: { castCount: 0, timeCounters: 2, onBattlefield: false },
      },
    };
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it('returns null when nothing is saved', () => {
    expect(loadState()).toBeNull();
  });

  it('returns null for unparsable JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadState()).toBeNull();
  });

  it('defaults commanders for saves from before that field existed', () => {
    localStorage.setItem(KEY, JSON.stringify({ turn: 2, cards: [] }));
    expect(loadState()).toEqual({
      turn: 2,
      cards: [],
      log: [],
      commanders: FRESH_COMMANDERS,
    });
  });

  it('defaults onBattlefield for saves from before commander battlefield presence was tracked', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        turn: 3,
        cards: [],
        log: [],
        commanders: { tenthDoctor: { castCount: 2 }, roseTyler: { castCount: 1, timeCounters: 3 } },
      }),
    );
    expect(loadState()?.commanders).toEqual({
      tenthDoctor: { castCount: 2, onBattlefield: false },
      roseTyler: { castCount: 1, timeCounters: 3, onBattlefield: false },
    });
  });

  it('defaults the log for saves from before it existed', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        turn: 1,
        cards: [],
        commanders: FRESH_COMMANDERS,
      }),
    );
    expect(loadState()?.log).toEqual([]);
  });

  it('clearState removes the saved game', () => {
    saveState({ turn: 1, cards: [], log: [], commanders: FRESH_COMMANDERS });
    clearState();
    expect(loadState()).toBeNull();
  });
});

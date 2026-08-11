import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { clearState, loadState, saveState } from './storage';

const KEY = 'mtg-time-tracker:game-state:v1';

describe('storage', () => {
  it('round-trips a saved game state', () => {
    const state: GameState = {
      turn: 5,
      cards: [],
      log: [],
      commanders: { tenthDoctor: { castCount: 1 }, roseTyler: { castCount: 0, timeCounters: 2 } },
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
      commanders: { tenthDoctor: { castCount: 0 }, roseTyler: { castCount: 0, timeCounters: 0 } },
    });
  });

  it('defaults the log for saves from before it existed', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        turn: 1,
        cards: [],
        commanders: { tenthDoctor: { castCount: 0 }, roseTyler: { castCount: 0, timeCounters: 0 } },
      }),
    );
    expect(loadState()?.log).toEqual([]);
  });

  it('clearState removes the saved game', () => {
    saveState({ turn: 1, cards: [], log: [], commanders: { tenthDoctor: { castCount: 0 }, roseTyler: { castCount: 0, timeCounters: 0 } } });
    clearState();
    expect(loadState()).toBeNull();
  });
});

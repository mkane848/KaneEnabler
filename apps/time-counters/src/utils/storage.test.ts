import { describe, expect, it, vi } from 'vitest';
import type { GameState, TrackedCard } from '../types';
import { clearState, loadState, saveState } from './storage';

const KEY = 'mtg-time-tracker:game-state:v1';

const FRESH_COMMANDERS = {
  tenthDoctor: { castCount: 0, onBattlefield: false },
  roseTyler: { castCount: 0, timeCounters: 0, onBattlefield: false },
};

const VALID_CARD: TrackedCard = {
  instanceId: 'a1',
  cardId: 'card-1',
  name: 'Test Suspend Card',
  mechanic: 'suspend',
  count: 3,
  startingCount: 4,
  direction: 'decrement',
  autoAdjust: true,
  resolveNote: 'Cast for free',
  turnAdded: 1,
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

  it('keeps a fully valid card, including every optional field', () => {
    const sagaCard: TrackedCard = {
      instanceId: 'saga-1',
      cardId: 'card-2',
      name: 'Test Saga',
      imageSmall: 'https://example.com/art.jpg',
      mechanic: 'saga',
      customLabel: undefined,
      count: 2,
      startingCount: 0,
      direction: 'increment',
      targetCount: 3,
      autoAdjust: true,
      resolveNote: 'Sacrifice it',
      turnAdded: 2,
      isToken: false,
      chapters: ['Chapter I text', 'Chapter II text', 'Chapter III text'],
      triggeredChapters: [1, 2],
      fadeExhausted: undefined,
    };
    localStorage.setItem(
      KEY,
      JSON.stringify({ turn: 2, cards: [sagaCard], log: [], commanders: FRESH_COMMANDERS }),
    );
    expect(loadState()?.cards).toEqual([sagaCard]);
  });

  it('drops a corrupted card and keeps the rest of the save intact', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        turn: 4,
        cards: [VALID_CARD, {}],
        log: [],
        commanders: FRESH_COMMANDERS,
      }),
    );
    const state = loadState();
    expect(state?.cards).toEqual([VALID_CARD]);
    expect(state?.turn).toBe(4);
  });

  it('drops a card with an invalid mechanic', () => {
    const corrupted = { ...VALID_CARD, instanceId: 'a2', mechanic: 'not-a-real-mechanic' };
    localStorage.setItem(
      KEY,
      JSON.stringify({ turn: 1, cards: [corrupted], log: [], commanders: FRESH_COMMANDERS }),
    );
    expect(loadState()?.cards).toEqual([]);
  });

  it('drops a card whose count is the wrong type', () => {
    const corrupted = { ...VALID_CARD, instanceId: 'a3', count: '3' };
    localStorage.setItem(
      KEY,
      JSON.stringify({ turn: 1, cards: [corrupted], log: [], commanders: FRESH_COMMANDERS }),
    );
    expect(loadState()?.cards).toEqual([]);
  });

  it('drops a Saga card whose chapters are not all strings', () => {
    const corrupted = { ...VALID_CARD, instanceId: 'a4', mechanic: 'saga', chapters: ['ok', 5] };
    localStorage.setItem(
      KEY,
      JSON.stringify({ turn: 1, cards: [corrupted], log: [], commanders: FRESH_COMMANDERS }),
    );
    expect(loadState()?.cards).toEqual([]);
  });

  it('warns when a corrupted card is dropped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      KEY,
      JSON.stringify({ turn: 1, cards: [{}], log: [], commanders: FRESH_COMMANDERS }),
    );
    loadState();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

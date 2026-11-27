import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, TrackedCard } from '../types';
import {
  clearState,
  loadState,
  parseState,
  saveState,
  subscribeToExternalChanges,
} from './storage';

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

const SAVED: GameState = { turn: 4, cards: [VALID_CARD], log: [], commanders: FRESH_COMMANDERS };

/** What the browser dispatches in *this* tab when another tab writes. */
function otherTabWrites(key: string | null, newValue: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
}

describe('parseState', () => {
  it('gives the same answer loadState gives for the same raw save', () => {
    const legacy = JSON.stringify({ turn: 2, cards: [VALID_CARD, {}] });
    localStorage.setItem(KEY, legacy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseState(legacy)).toEqual(loadState());
    warn.mockRestore();
  });

  it('returns null for unparsable JSON', () => {
    expect(parseState('{not json')).toBeNull();
  });
});

describe('saveState', () => {
  it('skips the write when storage already holds this exact game', () => {
    saveState(SAVED);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    saveState({ ...SAVED });
    expect(setItem).not.toHaveBeenCalled();
    saveState({ ...SAVED, turn: 5 });
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });
});

describe('subscribeToExternalChanges', () => {
  let unsubscribe: (() => void) | undefined;
  afterEach(() => unsubscribe?.());

  it("hands over another tab's save, validated", () => {
    const onChange = vi.fn();
    unsubscribe = subscribeToExternalChanges(onChange);
    otherTabWrites(KEY, JSON.stringify(SAVED));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(SAVED);
  });

  it('reports a reset in another tab as null', () => {
    const onChange = vi.fn();
    unsubscribe = subscribeToExternalChanges(onChange);
    otherTabWrites(KEY, null);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('reports storage being cleared outright as null', () => {
    const onChange = vi.fn();
    unsubscribe = subscribeToExternalChanges(onChange);
    otherTabWrites(null, null);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('reports a save that fails validation as null, as a reload would', () => {
    const onChange = vi.fn();
    unsubscribe = subscribeToExternalChanges(onChange);
    otherTabWrites(KEY, '{not json');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('ignores other keys, sessionStorage, and stops after unsubscribing', () => {
    const onChange = vi.fn();
    unsubscribe = subscribeToExternalChanges(onChange);
    otherTabWrites('mtg-time-tracker:theme', 'claude');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: JSON.stringify(SAVED),
        storageArea: sessionStorage,
      }),
    );
    unsubscribe();
    otherTabWrites(KEY, JSON.stringify(SAVED));
    expect(onChange).not.toHaveBeenCalled();
  });
});

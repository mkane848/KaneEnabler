import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardData } from '../types';
import { useGameState, type AddCardInput } from './useGameState';

function card(overrides: Partial<CardData> = {}): CardData {
  return { id: 'c1', name: 'Test Card', ...overrides };
}

function addInput(overrides: Partial<AddCardInput> = {}): AddCardInput {
  return {
    card: card(),
    mechanic: 'suspend',
    startingCount: 3,
    direction: 'decrement',
    autoAdjust: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('useGameState — cards', () => {
  it('starts with an empty board on turn 1', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.turn).toBe(1);
    expect(result.current.state.cards).toEqual([]);
  });

  it('addCard adds a tracked card and logs it', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    expect(result.current.state.cards).toHaveLength(1);
    expect(result.current.state.cards[0]).toMatchObject({ name: 'Test Card', mechanic: 'suspend', count: 3 });
    const [entry] = result.current.state.log.slice(-1);
    expect(entry.title).toBe('Added to tracker');
  });

  it('removeCard drops the card from the board', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0].instanceId;
    act(() => result.current.removeCard(id));
    expect(result.current.state.cards).toEqual([]);
  });

  it('setCount clamps to a non-negative whole number', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0].instanceId;
    act(() => result.current.setCount(id, -5));
    expect(result.current.state.cards[0].count).toBe(0);
  });

  it('adjustCount accumulates across rapid taps against the same base', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 5 })));
    const id = result.current.state.cards[0].instanceId;
    act(() => {
      result.current.adjustCount(id, -1);
      result.current.adjustCount(id, -1);
      result.current.adjustCount(id, -1);
    });
    expect(result.current.state.cards[0].count).toBe(2);
  });
});

describe('useGameState — nextTurn', () => {
  it('ticks a Suspend card down at upkeep', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 2 })));
    act(() => result.current.nextTurn());
    expect(result.current.state.turn).toBe(2);
    expect(result.current.state.cards[0].count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ step: 'upkeep', from: 2, to: 1, hitTarget: false }),
    ]);
  });

  it('leaves a card alone once it has hit its target rather than re-triggering', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 1 })));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0].count).toBe(0);
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0].count).toBe(0);
    expect(result.current.lastUpkeep).toBeNull();
  });

  it('does not adjust a card with autoAdjust disabled', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 3, autoAdjust: false })));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0].count).toBe(3);
  });

  it('gains a lore counter and fires the chapter I ability at precombat main', () => {
    const { result } = renderHook(() => useGameState());
    act(() =>
      result.current.addCard(
        addInput({
          mechanic: 'saga',
          direction: 'increment',
          startingCount: 0,
          targetCount: 3,
          chapters: ['Chapter I effect', 'Chapter II effect', 'Chapter III effect'],
        }),
      ),
    );
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0].count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ step: 'precombatMain', from: 0, to: 1, chapter: { number: 1, text: 'Chapter I effect' } }),
    ]);
  });
});

describe('useGameState — commander tax', () => {
  it('castCommander increments cast count and logs the resulting tax', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(1);
    act(() => result.current.castCommander('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(2);
    const [entry] = result.current.state.log.slice(-1);
    expect(entry.detail).toContain('{4}');
  });

  it('tracks each commander independently', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('roseTyler'));
    expect(result.current.state.commanders.roseTyler.castCount).toBe(1);
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(0);
  });
});

describe('useGameState — Bad Wolf / Rose Tyler', () => {
  it('roseAttacks counts tracked Suspend/Vanishing cards but not Fading or Saga', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 2 }));
      result.current.addCard(addInput({ mechanic: 'vanishing', startingCount: 2 }));
      result.current.addCard(addInput({ mechanic: 'fading', startingCount: 2 }));
    });
    act(() => result.current.roseAttacks());
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(2);
  });

  it('adjustRoseTimeCounters never goes below zero', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.adjustRoseTimeCounters(-3));
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(0);
  });
});

describe('useGameState — resetGame', () => {
  it('clears the board and turn back to initial state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(addInput());
      result.current.nextTurn();
    });
    act(() => result.current.resetGame());
    expect(result.current.state).toEqual({
      turn: 1,
      cards: [],
      log: [],
      commanders: { tenthDoctor: { castCount: 0 }, roseTyler: { castCount: 0, timeCounters: 0 } },
    });
  });
});

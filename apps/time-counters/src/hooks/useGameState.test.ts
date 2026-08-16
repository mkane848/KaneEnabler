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
    expect(result.current.state.cards[0]).toMatchObject({
      name: 'Test Card',
      mechanic: 'suspend',
      count: 3,
    });
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.title).toBe('Added to tracker');
  });

  it('removeCard drops the card from the board', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));
    expect(result.current.state.cards).toEqual([]);
  });

  it('setCount clamps to a non-negative whole number', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.setCount(id, -5));
    expect(result.current.state.cards[0]!.count).toBe(0);
  });

  it('adjustCount accumulates across rapid taps against the same base', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 5 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => {
      result.current.adjustCount(id, -1);
      result.current.adjustCount(id, -1);
      result.current.adjustCount(id, -1);
    });
    expect(result.current.state.cards[0]!.count).toBe(2);
  });
});

describe('useGameState — nextTurn', () => {
  it('ticks a Suspend card down at upkeep', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 2 })));
    act(() => result.current.nextTurn());
    expect(result.current.state.turn).toBe(2);
    expect(result.current.state.cards[0]!.count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ step: 'upkeep', from: 2, to: 1, hitTarget: false }),
    ]);
  });

  it('leaves a card alone once it has hit its target rather than re-triggering', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 1 })));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(0);
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.lastUpkeep).toBeNull();
  });

  it('does not adjust a card with autoAdjust disabled', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 3, autoAdjust: false })));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(3);
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
    expect(result.current.state.cards[0]!.count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({
        step: 'precombatMain',
        from: 0,
        to: 1,
        chapter: { number: 1, text: 'Chapter I effect' },
      }),
    ]);
  });
});

function sagaInput(overrides: Partial<AddCardInput> = {}): AddCardInput {
  return addInput({
    mechanic: 'saga',
    direction: 'increment',
    startingCount: 0,
    targetCount: 3,
    chapters: ['Chapter I effect', 'Chapter II effect', 'Chapter III effect'],
    ...overrides,
  });
}

describe('useGameState — Saga manual edits trigger chapters', () => {
  it('setCount jumping from 0 to 2 fires chapter I and II, not just II', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput()));
    const id = result.current.state.cards[0]!.instanceId;

    act(() => result.current.setCount(id, 2));
    expect(result.current.state.cards[0]!.count).toBe(2);
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1, 2]);
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.detail).toContain('Chapter I');
    expect(entry!.detail).toContain('II');
  });

  it('a later nextTurn only fires chapter III, since I and II were already caught up by the manual edit', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput()));
    const id = result.current.state.cards[0]!.instanceId;

    act(() => result.current.setCount(id, 2));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(3);
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1, 2, 3]);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({
        instanceId: id,
        chapter: { number: 3, text: 'Chapter III effect' },
      }),
    ]);
  });

  it('adjustCount stepping by more than one also catches up every chapter it crosses', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput()));
    const id = result.current.state.cards[0]!.instanceId;

    act(() => result.current.adjustCount(id, 2));
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1, 2]);
  });

  it('a downward correction does not un-trigger a chapter that already fired', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput()));
    const id = result.current.state.cards[0]!.instanceId;

    act(() => result.current.nextTurn()); // 0 -> 1, chapter I fires
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1]);

    act(() => result.current.setCount(id, 0));
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1]);
  });
});

describe('useGameState — Fading timing (CR 702.32b)', () => {
  it('a Fading N card survives N+1 upkeeps — only flagged ready on the upkeep the removal fails', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'fading', startingCount: 2 })));
    const id = result.current.state.cards[0]!.instanceId;

    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ instanceId: id, from: 2, to: 1, hitTarget: false }),
    ]);

    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ instanceId: id, from: 1, to: 0, hitTarget: false }),
    ]);

    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ instanceId: id, from: 0, to: 0, hitTarget: true }),
    ]);
  });

  it('stops re-triggering once the Fading card is exhausted', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'fading', startingCount: 1 })));
    act(() => result.current.nextTurn()); // 1 -> 0, removal still succeeded
    act(() => result.current.nextTurn()); // can't remove -> sacrifice trigger, now exhausted
    act(() => result.current.nextTurn()); // already exhausted -> left alone
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.lastUpkeep).toBeNull();
  });

  it('Vanishing N (unlike Fading N) is ready the moment count reaches 0, not one turn later', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'vanishing', startingCount: 1 })));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(0);
    expect(result.current.lastUpkeep).toEqual([
      expect.objectContaining({ from: 1, to: 0, hitTarget: true }),
    ]);
  });

  it('removeCard logs a Fading card as resolved only once exhausted, not merely at 0', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'fading', startingCount: 1 })));
    act(() => result.current.nextTurn()); // count -> 0, removal succeeded, not yet exhausted
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.title).toBe('Removed');
  });

  it('a manual edit that restores a Fading card above 0 clears its exhausted flag', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'fading', startingCount: 1 })));
    act(() => result.current.nextTurn()); // 1 -> 0
    act(() => result.current.nextTurn()); // exhausted, hitTarget true
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.setCount(id, 2));
    act(() => result.current.nextTurn());
    expect(result.current.state.cards[0]!.count).toBe(1);
    expect(result.current.lastUpkeep).toEqual([expect.objectContaining({ hitTarget: false })]);
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
    expect(entry!.detail).toContain('{4}');
  });

  it('tracks each commander independently', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('roseTyler'));
    expect(result.current.state.commanders.roseTyler.castCount).toBe(1);
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(0);
  });

  it('castCommander puts the commander on the battlefield', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state.commanders.tenthDoctor.onBattlefield).toBe(false);
    act(() => result.current.castCommander('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.onBattlefield).toBe(true);
  });

  it('returnCommanderToCommandZone leaves the battlefield without touching tax', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('tenthDoctor'));
    act(() => result.current.returnCommanderToCommandZone('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.onBattlefield).toBe(false);
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(1);
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.title).toBe('Returned to command zone');
  });

  it('returnCommanderToCommandZone is a no-op when the commander is not on the battlefield', () => {
    const { result } = renderHook(() => useGameState());
    const before = result.current.state;
    act(() => result.current.returnCommanderToCommandZone('tenthDoctor'));
    expect(result.current.state).toBe(before);
  });

  it('casting again after returning to the command zone keeps accruing tax', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('tenthDoctor'));
    act(() => result.current.returnCommanderToCommandZone('tenthDoctor'));
    act(() => result.current.castCommander('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(2);
    expect(result.current.state.commanders.tenthDoctor.onBattlefield).toBe(true);
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

  it('a suspended card counts unconditionally, even at 0 counters — unlike Vanishing', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 0 }));
      result.current.addCard(addInput({ mechanic: 'vanishing', startingCount: 0 }));
    });
    act(() => result.current.roseAttacks());
    // Only the suspended card contributes — "each suspended card you own" is
    // unconditional, but "each other permanent with a time counter on it"
    // requires an actual counter, which the Vanishing card no longer has.
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(1);
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
      commanders: {
        tenthDoctor: { castCount: 0, onBattlefield: false },
        roseTyler: { castCount: 0, timeCounters: 0, onBattlefield: false },
      },
    });
  });
});

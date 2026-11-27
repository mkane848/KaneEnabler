import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardData, GameState } from '../types';
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

  it('undoRemove restores the most recently removed card', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));
    expect(result.current.state.cards).toEqual([]);
    expect(result.current.lastRemoved?.card.instanceId).toBe(id);

    act(() => result.current.undoRemove());
    expect(result.current.state.cards).toHaveLength(1);
    expect(result.current.state.cards[0]!.instanceId).toBe(id);
    expect(result.current.lastRemoved).toBeNull();
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.title).toBe('Undo');
  });

  it('dismissLastRemoved clears the undo record without restoring the card', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));
    act(() => result.current.dismissLastRemoved());
    expect(result.current.lastRemoved).toBeNull();

    act(() => result.current.undoRemove());
    expect(result.current.state.cards).toEqual([]);
  });

  it('a second removal replaces the undo record for the first', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ card: card({ id: 'c1', name: 'First' }) })));
    act(() => result.current.addCard(addInput({ card: card({ id: 'c2', name: 'Second' }) })));
    const [firstId, secondId] = result.current.state.cards.map((c) => c.instanceId);

    act(() => result.current.removeCard(firstId!));
    act(() => result.current.removeCard(secondId!));
    expect(result.current.lastRemoved?.card.name).toBe('Second');

    act(() => result.current.undoRemove());
    expect(result.current.state.cards.map((c) => c.name)).toEqual(['Second']);
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
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.detail).toContain('{2}');
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

  it('a suspended card with no time counters left no longer counts — same as Vanishing (CR 702.62b)', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 0 }));
      result.current.addCard(addInput({ mechanic: 'vanishing', startingCount: 0 }));
    });
    act(() => result.current.roseAttacks());
    // CR 702.62b: a card is "suspended" only while it has a time counter on it.
    // At 0 counters the card has been cast, so neither card contributes.
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(0);
  });
});

describe('useGameState — Time Travel', () => {
  it('removes a time counter from a Suspend card', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 3 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.applyTimeTravel([{ id, delta: -1 }], { current: 1, total: 3 }));
    expect(result.current.state.cards[0]!.count).toBe(2);
  });

  it('adds a time counter — no upper bound for a decrement-direction card', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 1 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.applyTimeTravel([{ id, delta: 1 }], { current: 1, total: 1 }));
    expect(result.current.state.cards[0]!.count).toBe(2);
  });

  it('never drops a card below 0 counters', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 0 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.applyTimeTravel([{ id, delta: -1 }], { current: 1, total: 1 }));
    expect(result.current.state.cards[0]!.count).toBe(0);
  });

  it('a delta that clamps back to the same count is not logged as a change', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 0 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.applyTimeTravel([{ id, delta: -1 }], { current: 1, total: 1 }));
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.changes).toEqual([]);
    expect(entry!.detail).toBe('No counters added or removed this pass.');
  });

  it('a delta of 0 is a no-op and is not logged', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ mechanic: 'suspend', startingCount: 2 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.applyTimeTravel([{ id, delta: 0 }], { current: 1, total: 1 }));
    expect(result.current.state.cards[0]!.count).toBe(2);
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.detail).toBe('No counters added or removed this pass.');
  });

  it('leaves a card untouched if it is not named in the choices at all', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(
        addInput({ card: card({ id: 'a', name: 'A' }), mechanic: 'suspend', startingCount: 2 }),
      );
      result.current.addCard(
        addInput({ card: card({ id: 'b', name: 'B' }), mechanic: 'suspend', startingCount: 2 }),
      );
    });
    const [aId] = result.current.state.cards.map((c) => c.instanceId);
    act(() => result.current.applyTimeTravel([{ id: aId!, delta: -1 }], { current: 1, total: 1 }));
    expect(result.current.state.cards.map((c) => c.count)).toEqual([1, 2]);
  });

  it("adjusts Rose Tyler's own Bad Wolf counters via the 'rose' sentinel id", () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.adjustRoseTimeCounters(3));
    act(() =>
      result.current.applyTimeTravel([{ id: 'rose', delta: -1 }], { current: 1, total: 1 }),
    );
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(2);
  });

  it("never drops Rose Tyler's own counters below 0", () => {
    const { result } = renderHook(() => useGameState());
    act(() =>
      result.current.applyTimeTravel([{ id: 'rose', delta: -1 }], { current: 1, total: 1 }),
    );
    expect(result.current.state.commanders.roseTyler.timeCounters).toBe(0);
  });

  it('logs one entry per pass, naming the pass number and every card/Rose that actually changed', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(
        addInput({ card: card({ id: 'a', name: 'A' }), mechanic: 'suspend', startingCount: 2 }),
      );
      result.current.adjustRoseTimeCounters(1);
    });
    const id = result.current.state.cards[0]!.instanceId;
    act(() =>
      result.current.applyTimeTravel(
        [
          { id, delta: -1 },
          { id: 'rose', delta: 1 },
        ],
        { current: 2, total: 3 },
      ),
    );
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.title).toBe('Time Travel — pass 2 of 3');
    expect(entry!.changes).toEqual([
      { name: 'A', mechanic: 'suspend', from: 2, to: 1 },
      { name: 'Rose Tyler — Bad Wolf counters', mechanic: 'custom', from: 1, to: 2 },
    ]);
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

describe('useGameState — the undo window closes when time moves on (B1)', () => {
  it('Next Turn closes the undo window, so Undo cannot restore a card that skipped its upkeep', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput({ startingCount: 3 })));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));
    expect(result.current.lastRemoved?.card.instanceId).toBe(id);

    act(() => result.current.nextTurn());
    expect(result.current.lastRemoved).toBeNull();

    act(() => result.current.undoRemove());
    expect(result.current.state.cards).toEqual([]);
  });

  it('a manual turn edit closes the undo window', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    const id = result.current.state.cards[0]!.instanceId;
    act(() => result.current.removeCard(id));

    act(() => result.current.setTurn(2));
    expect(result.current.lastRemoved).toBeNull();

    act(() => result.current.undoRemove());
    expect(result.current.state.cards).toEqual([]);
  });

  it('Time Travel closes the undo window', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.addCard(addInput({ card: card({ id: 'a', name: 'A' }), startingCount: 2 }));
      result.current.addCard(addInput({ card: card({ id: 'b', name: 'B' }), startingCount: 2 }));
    });
    const [aId, bId] = result.current.state.cards.map((c) => c.instanceId);
    act(() => result.current.removeCard(bId!));
    expect(result.current.lastRemoved?.card.instanceId).toBe(bId);

    act(() => result.current.applyTimeTravel([{ id: aId!, delta: -1 }], { current: 1, total: 1 }));
    expect(result.current.lastRemoved).toBeNull();

    act(() => result.current.undoRemove());
    expect(result.current.state.cards.map((c) => c.name)).toEqual(['A']);
  });
});

describe('useGameState — turn edits (B5)', () => {
  it('moving the turn backward re-anchors a card added after it', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.setTurn(5));
    act(() => result.current.addCard(addInput()));
    expect(result.current.state.cards[0]!.turnAdded).toBe(5);

    act(() => result.current.setTurn(2));
    expect(result.current.state.turn).toBe(2);
    expect(result.current.state.cards[0]!.turnAdded).toBe(2);
  });

  it('moving the turn forward leaves turnAdded unchanged', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    act(() => result.current.setTurn(5));
    expect(result.current.state.cards[0]!.turnAdded).toBe(1);
  });

  it('only re-anchors cards added after the new turn', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.setTurn(3));
    act(() => result.current.addCard(addInput({ card: card({ id: 'a', name: 'A' }) })));
    act(() => result.current.setTurn(5));
    act(() => result.current.addCard(addInput({ card: card({ id: 'b', name: 'B' }) })));

    act(() => result.current.setTurn(4));
    expect(result.current.state.cards.map((c) => c.turnAdded)).toEqual([3, 4]);
  });
});

describe('useGameState — Saga starting lore (B3)', () => {
  it('records the chapters already covered by the starting lore count', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput({ startingCount: 2 })));
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1, 2]);
  });

  it('does not re-fire chapter I after a Saga added at lore 1 is corrected to 0 and back to 1', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(sagaInput({ startingCount: 1 })));
    const id = result.current.state.cards[0]!.instanceId;
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1]);

    act(() => result.current.setCount(id, 0));
    act(() => result.current.setCount(id, 1));
    expect(result.current.state.cards[0]!.triggeredChapters).toEqual([1]);
    const [entry] = result.current.state.log.slice(-1);
    expect(entry!.detail).not.toContain('triggers Chapter');
  });
});

describe('useGameState — commander cast guard (B4)', () => {
  it('casting a commander already on the battlefield does not increase its tax', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.castCommander('tenthDoctor'));
    act(() => result.current.castCommander('tenthDoctor'));
    expect(result.current.state.commanders.tenthDoctor.castCount).toBe(1);
    expect(result.current.state.commanders.tenthDoctor.onBattlefield).toBe(true);
  });
});

const KEY = 'mtg-time-tracker:game-state:v1';

/** Stands in for another tab: it writes storage, and the browser tells this
 * tab with a `storage` event (never the writer itself). */
function otherTabSaves(game: GameState | null) {
  const newValue = game ? JSON.stringify(game) : null;
  if (newValue) localStorage.setItem(KEY, newValue);
  else localStorage.removeItem(KEY);
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: KEY, newValue, storageArea: localStorage }),
    );
  });
}

describe('useGameState — cross-tab sync (D9)', () => {
  function otherTabGame(): GameState {
    const { result, unmount } = renderHook(() => useGameState());
    act(() =>
      result.current.addCard(addInput({ card: card({ id: 'c2', name: 'Other Tab Card' }) })),
    );
    act(() => result.current.setTurn(6));
    const game = result.current.state;
    unmount();
    localStorage.clear();
    return game;
  }

  it("adopts another tab's game and says so", () => {
    const incoming = otherTabGame();
    const { result } = renderHook(() => useGameState());
    otherTabSaves(incoming);
    expect(result.current.state).toEqual(incoming);
    expect(result.current.externalChange).toBe('updated');
  });

  it('closes the undo window and the upkeep summary, which described the old board', () => {
    const incoming = otherTabGame();
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    act(() => result.current.nextTurn());
    act(() => result.current.addCard(addInput()));
    act(() => result.current.removeCard(result.current.state.cards[1]!.instanceId));
    expect(result.current.lastUpkeep).not.toBeNull();
    expect(result.current.lastRemoved).not.toBeNull();

    otherTabSaves(incoming);
    expect(result.current.lastUpkeep).toBeNull();
    expect(result.current.lastRemoved).toBeNull();
  });

  it('does not write the adopted game back, so the tabs cannot ping-pong', () => {
    const incoming = otherTabGame();
    const { result } = renderHook(() => useGameState());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    otherTabSaves(incoming);
    // The one call is otherTabSaves' own write, standing in for the other tab.
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual(incoming);
    setItem.mockRestore();
  });

  it('follows a reset in another tab back to a fresh game', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    otherTabSaves(null);
    expect(result.current.state.cards).toEqual([]);
    expect(result.current.state.turn).toBe(1);
    expect(result.current.externalChange).toBe('reset');
  });

  it('treats a corrupt save from another tab the way a reload would', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.addCard(addInput()));
    localStorage.setItem(KEY, '{not json');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: KEY, newValue: '{not json', storageArea: localStorage }),
      );
    });
    expect(result.current.state.cards).toEqual([]);
    expect(result.current.externalChange).toBe('reset');
  });

  it('clears the notice on dismiss, or on the next action that changes something', () => {
    const { result } = renderHook(() => useGameState());
    otherTabSaves(otherTabGame());
    act(() => result.current.dismissExternalChange());
    expect(result.current.externalChange).toBeNull();

    otherTabSaves(otherTabGame());
    // Dismissing an undo prompt that isn't showing changes nothing.
    act(() => result.current.dismissLastRemoved());
    expect(result.current.externalChange).toBe('updated');
    act(() => result.current.nextTurn());
    expect(result.current.externalChange).toBeNull();
  });

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useGameState());
    const before = result.current.state;
    unmount();
    otherTabSaves(otherTabGame());
    expect(result.current.state).toBe(before);
  });
});

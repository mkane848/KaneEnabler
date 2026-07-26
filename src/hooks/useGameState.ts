import { useCallback, useEffect, useState } from 'react';
import type { CardData, Direction, GameState, Mechanic, TrackedCard, TurnChange } from '../types';
import { defaultResolveNote } from '../utils/counters';
import { clearState, loadState, saveState } from '../utils/storage';

const INITIAL_STATE: GameState = { turn: 1, cards: [] };

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Counters are whole numbers, never negative, and an increment Custom
 * counter with a known target can't be pushed past it — that would
 * represent a game state that can't actually happen.
 */
function clampCount(count: number, direction: Direction, targetCount?: number): number {
  const rounded = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (direction === 'increment' && targetCount != null) return Math.min(rounded, targetCount);
  return rounded;
}

/** True once this card's counter has reached whatever ends it. */
function hasHitTarget(count: number, direction: Direction, targetCount?: number): boolean {
  if (direction === 'decrement') return count <= 0;
  return targetCount != null && count >= targetCount;
}

export interface AddCardInput {
  card: CardData;
  mechanic: Mechanic;
  customLabel?: string;
  startingCount: number;
  direction: Direction;
  targetCount?: number;
  autoAdjust: boolean;
  resolveNote?: string;
}

/**
 * The persisted game plus the most recent upkeep summary, held together in
 * one object so that advancing the turn and recording what changed happen in
 * a single atomic update. Every mutation below derives its next value from
 * `prev` rather than from a render-time snapshot — otherwise two taps landing
 * in the same batch would both compute from the same stale base, and the
 * second would silently overwrite the first.
 */
interface TrackerState {
  game: GameState;
  lastUpkeep: TurnChange[] | null;
}

export function useGameState() {
  const [{ game, lastUpkeep }, setTracker] = useState<TrackerState>(() => ({
    game: loadState() ?? INITIAL_STATE,
    lastUpkeep: null,
  }));

  useEffect(() => {
    saveState(game);
  }, [game]);

  const addCard = useCallback((input: AddCardInput) => {
    setTracker(prev => {
      const tracked: TrackedCard = {
        instanceId: makeId(),
        cardId: input.card.id,
        name: input.card.name,
        imageSmall: input.card.imageSmall,
        mechanic: input.mechanic,
        customLabel: input.customLabel,
        count: clampCount(input.startingCount, input.direction, input.targetCount),
        startingCount: input.startingCount,
        direction: input.direction,
        targetCount: input.targetCount,
        autoAdjust: input.autoAdjust,
        resolveNote: input.resolveNote?.trim() || defaultResolveNote(input.mechanic),
        turnAdded: prev.game.turn,
      };
      return { ...prev, game: { ...prev.game, cards: [...prev.game.cards, tracked] } };
    });
  }, []);

  /** Drops the card from the board and from any upkeep summary still on screen. */
  const removeCard = useCallback((instanceId: string) => {
    setTracker(prev => ({
      game: { ...prev.game, cards: prev.game.cards.filter(c => c.instanceId !== instanceId) },
      lastUpkeep: prev.lastUpkeep?.filter(c => c.instanceId !== instanceId) ?? null,
    }));
  }, []);

  /** Manual override — set a card's counters to an exact value. */
  const setCount = useCallback((instanceId: string, count: number) => {
    setTracker(prev => ({
      ...prev,
      game: {
        ...prev.game,
        cards: prev.game.cards.map(c =>
          c.instanceId === instanceId ? { ...c, count: clampCount(count, c.direction, c.targetCount) } : c,
        ),
      },
    }));
  }, []);

  /**
   * Manual override — step a card's counters up or down. The arithmetic runs
   * against `prev`, so rapid +/− taps accumulate instead of each recomputing
   * from the same rendered count.
   */
  const adjustCount = useCallback((instanceId: string, delta: number) => {
    setTracker(prev => ({
      ...prev,
      game: {
        ...prev.game,
        cards: prev.game.cards.map(c =>
          c.instanceId === instanceId
            ? { ...c, count: clampCount(c.count + delta, c.direction, c.targetCount) }
            : c,
        ),
      },
    }));
  }, []);

  const setTurn = useCallback((turn: number) => {
    const safe = Number.isFinite(turn) ? Math.max(1, Math.round(turn)) : 1;
    setTracker(prev => ({ ...prev, game: { ...prev.game, turn: safe } }));
  }, []);

  /**
   * Advances to the player's next turn, adjusting every auto-adjusting
   * card's counter by one step in its own direction — Suspend, Vanishing,
   * and Fading all count down. A card that has already hit its target is
   * left alone rather than re-triggering. The summary of what changed is
   * stored alongside the new game state so the two can never disagree.
   *
   * This is distinct from the Time Travel keyword action (see
   * applyTimeTravel below): Next Turn is the automatic, once-per-turn
   * upkeep trigger every Suspend/Vanishing/Fading card has on its own.
   * Time Travel is a separate, optional effect specific cards grant —
   * it isn't tied to the turn counter at all.
   */
  const nextTurn = useCallback(() => {
    setTracker(prev => {
      const changes: TurnChange[] = [];
      const cards = prev.game.cards.map(c => {
        if (!c.autoAdjust || hasHitTarget(c.count, c.direction, c.targetCount)) return c;
        const to = clampCount(c.count + (c.direction === 'decrement' ? -1 : 1), c.direction, c.targetCount);
        changes.push({
          instanceId: c.instanceId,
          name: c.name,
          mechanic: c.mechanic,
          from: c.count,
          to,
          hitTarget: hasHitTarget(to, c.direction, c.targetCount),
          resolveNote: c.resolveNote,
        });
        return { ...c, count: to };
      });
      return {
        game: { turn: prev.game.turn + 1, cards },
        // Only interrupt the player when something actually happened.
        lastUpkeep: changes.length > 0 ? changes : null,
      };
    });
  }, []);

  /**
   * Time Travel keyword action: "For each suspended card you own and each
   * permanent you control with a time counter on it, you may add or remove
   * a time counter." Each choice is capped to exactly one counter in either
   * direction — this isn't a free stepper, it's one pass of the real
   * keyword's per-object choice. Unlike Next Turn this never touches the
   * turn counter, and the +1/−1 choice isn't limited by a card's own
   * direction — the keyword can add a counter to a Suspend card just as
   * freely as removing one. All chosen deltas apply in a single update, so
   * choosing several at once can't land the double-tap-style desync that
   * per-card calls made possible before.
   */
  const applyTimeTravel = useCallback((choices: { instanceId: string; delta: -1 | 0 | 1 }[]) => {
    const nonZero = choices.filter(c => c.delta !== 0);
    if (nonZero.length === 0) return;
    setTracker(prev => ({
      ...prev,
      game: {
        ...prev.game,
        cards: prev.game.cards.map(c => {
          const choice = nonZero.find(d => d.instanceId === c.instanceId);
          if (!choice) return c;
          return { ...c, count: clampCount(c.count + choice.delta, c.direction, c.targetCount) };
        }),
      },
    }));
  }, []);

  const dismissUpkeep = useCallback(() => {
    setTracker(prev => (prev.lastUpkeep === null ? prev : { ...prev, lastUpkeep: null }));
  }, []);

  const resetGame = useCallback(() => {
    clearState();
    setTracker({ game: INITIAL_STATE, lastUpkeep: null });
  }, []);

  return {
    state: game,
    lastUpkeep,
    addCard,
    removeCard,
    setCount,
    adjustCount,
    setTurn,
    nextTurn,
    applyTimeTravel,
    dismissUpkeep,
    resetGame,
  };
}

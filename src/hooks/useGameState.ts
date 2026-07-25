import { useCallback, useEffect, useState } from 'react';
import type { CardData, GameState, Mechanic, TrackedCard, TurnChange } from '../types';
import { defaultResolveNote } from '../utils/counters';
import { clearState, loadState, saveState } from '../utils/storage';

const INITIAL_STATE: GameState = { turn: 1, cards: [] };

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Counters are whole numbers and never drop below zero. */
function clampCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

export interface AddCardInput {
  card: CardData;
  mechanic: Mechanic;
  customLabel?: string;
  startingCount: number;
  autoDecrement: boolean;
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
        imageNormal: input.card.imageNormal,
        mechanic: input.mechanic,
        customLabel: input.customLabel,
        count: input.startingCount,
        startingCount: input.startingCount,
        autoDecrement: input.autoDecrement,
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
          c.instanceId === instanceId ? { ...c, count: clampCount(count) } : c,
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
          c.instanceId === instanceId ? { ...c, count: clampCount(c.count + delta) } : c,
        ),
      },
    }));
  }, []);

  const setTurn = useCallback((turn: number) => {
    const safe = Number.isFinite(turn) ? Math.max(1, Math.round(turn)) : 1;
    setTracker(prev => ({ ...prev, game: { ...prev.game, turn: safe } }));
  }, []);

  /**
   * Advances to the player's next turn, removing one counter from every
   * auto-decrementing card that still has counters left — Suspend and
   * Vanishing both lose exactly one time counter at the beginning of their
   * owner's upkeep. The summary of what changed is stored alongside the new
   * game state so the two can never disagree.
   */
  const nextTurn = useCallback(() => {
    setTracker(prev => {
      const changes: TurnChange[] = [];
      const cards = prev.game.cards.map(c => {
        if (!c.autoDecrement || c.count <= 0) return c;
        const to = c.count - 1;
        changes.push({
          instanceId: c.instanceId,
          name: c.name,
          from: c.count,
          to,
          hitZero: to === 0,
          resolveNote: c.resolveNote,
        });
        return { ...c, count: to };
      });
      return {
        game: { turn: prev.game.turn + 1, cards },
        // Only interrupt the player when something actually happened at upkeep.
        lastUpkeep: changes.length > 0 ? changes : null,
      };
    });
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
    dismissUpkeep,
    resetGame,
  };
}

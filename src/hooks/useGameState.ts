import { useCallback, useEffect, useState } from 'react';
import type { CardData, GameState, Mechanic, TrackedCard, TurnChange } from '../types';
import { defaultResolveNote } from '../utils/counters';
import { clearState, loadState, saveState } from '../utils/storage';

const INITIAL_STATE: GameState = { turn: 1, cards: [] };

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export interface AddCardInput {
  card: CardData;
  mechanic: Mechanic;
  customLabel?: string;
  startingCount: number;
  autoDecrement: boolean;
  resolveNote?: string;
}

export function useGameState() {
  const [state, setState] = useState<GameState>(() => loadState() ?? INITIAL_STATE);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addCard = useCallback((input: AddCardInput) => {
    setState(prev => {
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
        turnAdded: prev.turn,
      };
      return { ...prev, cards: [...prev.cards, tracked] };
    });
  }, []);

  const removeCard = useCallback((instanceId: string) => {
    setState(prev => ({ ...prev, cards: prev.cards.filter(c => c.instanceId !== instanceId) }));
  }, []);

  /** Manual override — set a card's counters to an exact value. */
  const setCount = useCallback((instanceId: string, count: number) => {
    const safe = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
    setState(prev => ({
      ...prev,
      cards: prev.cards.map(c => (c.instanceId === instanceId ? { ...c, count: safe } : c)),
    }));
  }, []);

  const setTurn = useCallback((turn: number) => {
    const safe = Number.isFinite(turn) ? Math.max(1, Math.round(turn)) : 1;
    setState(prev => ({ ...prev, turn: safe }));
  }, []);

  /**
   * Advances to the player's next turn, removing one counter from every
   * auto-decrementing card that still has counters left. Returns the list
   * of changes so the UI can summarize what happened at upkeep.
   */
  const nextTurn = useCallback((): TurnChange[] => {
    const changes: TurnChange[] = [];
    const cards = state.cards.map(c => {
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
    setState(prev => ({ ...prev, turn: prev.turn + 1, cards }));
    return changes;
  }, [state.cards]);

  const resetGame = useCallback(() => {
    clearState();
    setState(INITIAL_STATE);
  }, []);

  return { state, addCard, removeCard, setCount, setTurn, nextTurn, resetGame };
}

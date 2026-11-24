import { useCallback, useEffect, useState } from 'react';
import type { CardData } from '../types';
import { loadCatalog } from '../utils/cardCatalog';

export interface CatalogState {
  cards: CardData[] | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

/**
 * Loads the shared card catalog once and hands it to whoever needs it.
 * The underlying fetch is cached module-side, so mounting several consumers
 * does not refetch.
 *
 * A failure used to be terminal for the hook even though loadCatalog clears
 * its in-flight promise to allow a later attempt (docs/state-machine-audit.md
 * §3.2). `retry` re-runs the effect for that case; manual entry in
 * AddCardPanel stays available throughout.
 */
export function useCardCatalog(): CatalogState {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((loaded) => {
        if (active) {
          setCards(loaded);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { cards, error, loading: cards === null && error === null, retry };
}

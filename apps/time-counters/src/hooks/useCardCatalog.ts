import { useEffect, useState } from 'react';
import type { CardData } from '../types';
import { loadCatalog } from '../utils/cardCatalog';

export interface CatalogState {
  cards: CardData[] | null;
  error: string | null;
  loading: boolean;
}

/**
 * Loads the shared card catalog once and hands it to whoever needs it.
 * The underlying fetch is cached module-side, so mounting several consumers
 * does not refetch.
 */
export function useCardCatalog(): CatalogState {
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((loaded) => {
        if (active) setCards(loaded);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  return { cards, error, loading: cards === null && error === null };
}

import { useMemo } from 'react';
import type { CardData, CommanderId } from '../types';
import { COMMANDER_IDS, COMMANDER_NAME } from '../utils/commanders';
import { findCardByName } from '../utils/cardCatalog';
import { useCardCatalog } from './useCardCatalog';

/**
 * Each commander's catalog entry (for art), keyed by id — empty until the
 * catalog loads. Memoized on `catalog`: useCardCatalog only ever sets it
 * once (null, then one stable array for the rest of the session), so this
 * scan runs at most once instead of on every render — there are only two
 * commanders, but each is its own O(n) findCardByName over the ~18k-card
 * catalog, which adds up when it reruns on every keystroke elsewhere in
 * the app.
 */
export function useCommanderCards(): Partial<Record<CommanderId, CardData>> {
  const { cards: catalog } = useCardCatalog();

  return useMemo(() => {
    if (!catalog) return {};

    const result: Partial<Record<CommanderId, CardData>> = {};
    for (const id of COMMANDER_IDS) {
      const card = findCardByName(catalog, COMMANDER_NAME[id]);
      if (card) result[id] = card;
    }
    return result;
  }, [catalog]);
}

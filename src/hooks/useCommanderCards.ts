import type { CardData, CommanderId } from '../types';
import { COMMANDER_IDS, COMMANDER_NAME } from '../utils/commanders';
import { findCardByName } from '../utils/cardCatalog';
import { useCardCatalog } from './useCardCatalog';

/** Each commander's catalog entry (for art), keyed by id — empty until the catalog loads. */
export function useCommanderCards(): Partial<Record<CommanderId, CardData>> {
  const { cards: catalog } = useCardCatalog();
  if (!catalog) return {};

  const result: Partial<Record<CommanderId, CardData>> = {};
  for (const id of COMMANDER_IDS) {
    const card = findCardByName(catalog, COMMANDER_NAME[id]);
    if (card) result[id] = card;
  }
  return result;
}

/**
 * What the player owns, keyed the ways the deck builder counts: the game
 * limits copies by name, so ownership is by name too — any print of a name
 * fills a slot for that name. Basic Energy is keyed by type, since "Grass
 * Energy" and "Basic Grass Energy" are the same card at the table.
 */
import { isBasicEnergy, type PtcgCard } from '@ptcg/rules';
import { basicEnergyType } from './pool';

export interface Owned {
  byName: ReadonlyMap<string, number>;
  energyByType: ReadonlyMap<string, number>;
  /** Total cards owned. */
  total: number;
}

export const NOTHING_OWNED: Owned = { byName: new Map(), energyByType: new Map(), total: 0 };

export function summarizeOwned(
  entries: readonly { card: PtcgCard; count: number }[],
  energyTypes: readonly string[],
): Owned {
  const byName = new Map<string, number>();
  const energyByType = new Map<string, number>();
  let total = 0;
  for (const { card, count } of entries) {
    if (count <= 0) continue;
    total += count;
    const type = isBasicEnergy(card) ? basicEnergyType(card, energyTypes) : null;
    if (type) energyByType.set(type, (energyByType.get(type) ?? 0) + count);
    else byName.set(card.name, (byName.get(card.name) ?? 0) + count);
  }
  return { byName, energyByType, total };
}

export function ownedCount(owned: Owned, card: PtcgCard, energyTypes: readonly string[]): number {
  const type = isBasicEnergy(card) ? basicEnergyType(card, energyTypes) : null;
  return type ? (owned.energyByType.get(type) ?? 0) : (owned.byName.get(card.name) ?? 0);
}

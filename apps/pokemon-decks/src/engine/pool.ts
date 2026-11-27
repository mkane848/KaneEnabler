/**
 * The cards a format can use, indexed the way the deck builder asks for them.
 * Built once per catalog + format and reused for every candidate deck.
 */
import { isBasicEnergy, isPokemon, isTrainer, type Format, type PtcgCard } from '@ptcg/rules';
import type { Catalog } from '../data/catalog';
import { rolesOf, type Role } from './roles';

export interface PoolTrainer {
  card: PtcgCard;
  roles: Role[];
  /** How many prints of this name exist in the loaded card pool. */
  printCount: number;
}

export interface Pool {
  format: Format;
  catalog: Catalog;
  /** Legal Pokémon prints by name, newest last. */
  pokemonByName: ReadonlyMap<string, readonly PtcgCard[]>;
  /** One representative legal print per Trainer name. */
  trainers: readonly PoolTrainer[];
  /** One legal basic Energy print per Energy type. */
  basicEnergy: ReadonlyMap<string, PtcgCard>;
  /** Energy types the game uses in attack costs, read from the data. */
  energyTypes: readonly string[];
}

/**
 * The type a basic Energy provides, read from its name — "Grass Energy",
 * "Basic Grass Energy". Only types that also appear in attack costs count, so
 * the list stays whatever the data says it is.
 */
export function basicEnergyType(card: PtcgCard, energyTypes: readonly string[]): string | null {
  return (
    energyTypes.find((t) => card.name === `${t} Energy` || card.name === `Basic ${t} Energy`) ??
    null
  );
}

export function buildPool(catalog: Catalog, format: Format): Pool {
  // Catalog order is by series, not release date; the index lists sets in
  // release order, so a set's position there is its age.
  const age = new Map(catalog.index.sets.map((s, i) => [s.id, i]));
  const legal = catalog.cards
    .filter((c) => catalog.legality.isLegal(c, format))
    .sort((a, b) => (age.get(a.setId) ?? 0) - (age.get(b.setId) ?? 0));

  const costTypes = new Set<string>();
  for (const card of catalog.cards) {
    for (const attack of card.attacks ?? []) for (const t of attack.cost) costTypes.add(t);
  }
  costTypes.delete('Colorless');
  const energyTypes = [...costTypes].sort();

  const pokemonByName = new Map<string, PtcgCard[]>();
  const trainerByName = new Map<string, PtcgCard>();
  const basicEnergy = new Map<string, PtcgCard>();
  for (const card of legal) {
    if (isPokemon(card)) {
      const prints = pokemonByName.get(card.name);
      if (prints) prints.push(card);
      else pokemonByName.set(card.name, [card]);
    } else if (isTrainer(card)) {
      // Sorted oldest first, so the newest legal print wins — the one a
      // player is most likely to find, with the current wording.
      trainerByName.set(card.name, card);
    } else if (isBasicEnergy(card)) {
      const type = basicEnergyType(card, energyTypes);
      if (type) basicEnergy.set(type, card);
    }
  }

  const trainers = [...trainerByName.values()].map((card) => ({
    card,
    roles: rolesOf(card),
    printCount: catalog.byName.get(card.name)?.length ?? 1,
  }));

  return { format, catalog, pokemonByName, trainers, basicEnergy, energyTypes };
}

/**
 * A built deck as a text list in the same "count name SET number" shape the
 * parser reads, grouped Pokémon / Trainer / Energy with counts — so a
 * suggested deck can be copied out and pasted straight back in.
 */
import { isEnergy, isPokemon, type PtcgCard } from '@ptcg/rules';
import type { Catalog } from '../data/catalog';

export function exportList(
  cards: readonly { card: PtcgCard; count: number }[],
  catalog: Catalog,
): string {
  const groups: [string, { card: PtcgCard; count: number }[]][] = [
    ['Pokémon', cards.filter((c) => isPokemon(c.card))],
    ['Trainer', cards.filter((c) => !isPokemon(c.card) && !isEnergy(c.card))],
    ['Energy', cards.filter((c) => isEnergy(c.card))],
  ];
  const line = ({ card, count }: { card: PtcgCard; count: number }) => {
    const code = catalog.sets.get(card.setId)?.code;
    return code ? `${count} ${card.name} ${code} ${card.localId}` : `${count} ${card.name}`;
  };
  return groups
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => {
      const total = list.reduce((n, c) => n + c.count, 0);
      return [`${label}: ${total}`, ...list.map(line)].join('\n');
    })
    .join('\n\n');
}

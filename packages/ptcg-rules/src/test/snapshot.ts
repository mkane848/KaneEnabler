/**
 * The Pokémon app's committed card snapshot, read straight off disk so these
 * tests pin the rules to real TCGdex data rather than hand-built fixtures —
 * the same posture as @mtg/rules' partners.real-data.test.ts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PtcgCard } from '../card';
import type { LegalityData } from '../legality';

const DATA = path.resolve(__dirname, '../../../../apps/pokemon-decks/public/data');

interface Index extends LegalityData {
  series: { id: string; regulationMarks: string[] }[];
}

export const index: Index = JSON.parse(readFileSync(path.join(DATA, 'index.json'), 'utf8'));

const byId = new Map<string, PtcgCard>();
for (const { id } of index.series) {
  const cards: PtcgCard[] = JSON.parse(
    readFileSync(path.join(DATA, 'series', `${id}.json`), 'utf8'),
  );
  for (const card of cards) byId.set(card.id, card);
}

export const allCards: readonly PtcgCard[] = [...byId.values()];

/** A real card by TCGdex id; throws so a renamed id fails loudly, not as `undefined`. */
export function card(id: string): PtcgCard {
  const found = byId.get(id);
  if (!found) throw new Error(`No card ${id} in the snapshot`);
  return found;
}

export const hasCard = (id: string): boolean => byId.has(id);

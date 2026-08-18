import type { CardRow } from '../types';
import { parseJsonArray } from '../types';

export interface CardDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  backImageUri: string | null;
  backName: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  manaValue: number | null;
  power: string | null;
  toughness: string | null;
  scryfallUri: string | null;
  isGameChanger: boolean;
}

/** The wire shape every card-bearing response serializes a `CardRow` to. */
export function toCardDTO(row: CardRow): CardDTO {
  return {
    oracleId: row.oracle_id,
    name: row.name,
    imageUri: row.image_uri,
    backImageUri: row.back_image_uri ?? null,
    backName: row.back_name ?? null,
    colorIdentity: parseJsonArray(row.color_identity),
    typeLine: row.type_line,
    oracleText: row.oracle_text,
    manaCost: row.mana_cost,
    manaValue: row.cmc,
    power: row.power,
    toughness: row.toughness,
    scryfallUri: row.scryfall_uri,
    isGameChanger: !!row.game_changer,
  };
}

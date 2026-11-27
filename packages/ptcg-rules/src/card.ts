/**
 * The card shape the Pokémon app's snapshot carries — TCGdex's card database
 * trimmed to what these rules and the app read. Mirrors
 * apps/pokemon-decks/scripts/snapshot.mjs's `trimCard`; change them together.
 */
export interface PtcgCard {
  /** `<setId>-<localId>`, TCGdex's global id, e.g. `sv10-005`. */
  id: string;
  setId: string;
  /** The collector number as TCGdex stores it — `"005"`, `"21"`, `"SV85"`. */
  localId: string;
  /** English name, including any printed suffix (`"Yanmega ex"`). */
  name: string;
  category?: 'Pokemon' | 'Trainer' | 'Energy' | string;
  rarity?: string;
  /** `Basic`, `Stage1`, `Stage2`, `VMAX`, `VSTAR`, `V-UNION`, `BREAK`, `MEGA`, `LEVEL-UP`, `RESTORED`, `Baby`. */
  stage?: string;
  /** `ex`, `EX`, `GX`, `V`, `TAG TEAM-GX`, `Prime`, `Legend`, `SP`. */
  suffix?: string;
  hp?: number;
  types?: string[];
  /** English name of the Pokémon this evolves from. */
  evolveFrom?: string;
  abilities?: { type: string; name: string; effect: string }[];
  attacks?: { name: string; cost: string[]; damage?: string; effect?: string }[];
  retreat?: number;
  /** Trainer/Energy rules text. */
  effect?: string;
  trainerType?: string;
  /** `Normal` (basic Energy) or `Special`. */
  energyType?: string;
  regulationMark?: string;
}

export interface SetInfo {
  id: string;
  name: string;
  serieId: string;
  /** The code a PTCG Live export prints, e.g. `DRI`. Not unique: `30th` and `30th-c` share `30C`. */
  code?: string;
  releaseDate?: string;
  official?: number;
}

/** One of TCGdex's `meta/legals.ts` filters, as the snapshot vendors it. */
export interface LegalityFilter {
  includes: { series: string[]; sets: string[]; regulationMarks: string[] };
  excludes: { sets: string[]; cards: string[] };
}

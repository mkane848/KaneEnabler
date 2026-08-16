/**
 * Magic-specific presentation conventions.
 *
 * Two things players expect from any tool that shows colors, and notice
 * immediately when they're missing:
 *
 *   1. Colors are always listed in WUBRG order, never alphabetically and
 *      never in whatever order the data happened to arrive in.
 *   2. A color combination is named, not spelled out. "Golgari" reads
 *      faster than "Black/Green" to anyone who plays the format.
 */

export const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

export const COLOR_ORDER = new Map<string, number>(WUBRG.map((color, index) => [color, index]));

export const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};

/**
 * Sorts a color identity into WUBRG order.
 *
 * Scryfall generally returns identities already sorted, but this app also
 * builds them from filter state and user input, so normalise rather than
 * assume — an out-of-order pip row looks wrong to a player even if they
 * can't immediately say why.
 */
export function sortWubrg(colors: string[]): string[] {
  return [...colors].sort((a, b) => (COLOR_ORDER.get(a) ?? 99) - (COLOR_ORDER.get(b) ?? 99));
}

// Guild (2), shard/wedge (3), and Nephilim (4) names, keyed by WUBRG-sorted
// identity. These are the names players actually use for a color pair.
const IDENTITY_NAMES: Record<string, string> = {
  '': 'Colorless',
  W: 'Mono-White',
  U: 'Mono-Blue',
  B: 'Mono-Black',
  R: 'Mono-Red',
  G: 'Mono-Green',

  WU: 'Azorius',
  UB: 'Dimir',
  BR: 'Rakdos',
  RG: 'Gruul',
  WG: 'Selesnya',
  WB: 'Orzhov',
  UR: 'Izzet',
  BG: 'Golgari',
  WR: 'Boros',
  UG: 'Simic',

  WUB: 'Esper',
  UBR: 'Grixis',
  BRG: 'Jund',
  WRG: 'Naya',
  WUG: 'Bant',
  WBG: 'Abzan',
  WUR: 'Jeskai',
  UBG: 'Sultai',
  WBR: 'Mardu',
  URG: 'Temur',

  WUBR: 'Yore-Tiller',
  UBRG: 'Glint-Eye',
  WBRG: 'Dune-Brood',
  WURG: 'Ink-Treader',
  WUBG: 'Witch-Maw',

  WUBRG: 'Five-Color',
};

/** e.g. ['B','U'] -> "Dimir". Falls back to a color count if unnamed. */
export function identityName(colors: string[]): string {
  const key = sortWubrg(colors).join('');
  return IDENTITY_NAMES[key] ?? `${colors.length}-Color`;
}


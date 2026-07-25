/** Splits a mana cost string like "{2}{W/U}{R}" into its bracketed symbols, e.g. ["2", "W/U", "R"]. */
export function parseManaCost(manaCost?: string): string[] {
  if (!manaCost) return [];
  return manaCost.match(/\{[^}]+\}/g)?.map(s => s.slice(1, -1)) ?? [];
}

/** Maps a mana symbol to its Mana font class suffix, e.g. "W/U" -> "wu", "2" -> "2". */
export function manaSymbolClass(symbol: string): string {
  return symbol.toLowerCase().replace(/\//g, '');
}

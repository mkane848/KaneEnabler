/**
 * CR 903.10: the command-zone tax. Each previous cast of a specific
 * commander from the command zone this game adds {2} to its next cast,
 * tracked independently per commander and never reset by zone changes.
 * `castCount` is the number of previous casts; the return value is what
 * the *next* cast adds on top of the commander's own mana cost.
 */
export function commanderTax(castCount: number): number {
  return castCount * 2;
}

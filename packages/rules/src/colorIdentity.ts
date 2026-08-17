/**
 * CR 903.4: a card is legal in a Commander deck only if every color in its
 * color identity is also in the commander's. An empty `cardColors` (a
 * colorless card) is vacuously within any identity — `[].every(...)` is
 * `true` with no special-casing needed.
 */
export function isWithinColorIdentity(
  cardColors: readonly string[],
  identity: ReadonlySet<string>,
): boolean {
  return cardColors.every((color) => identity.has(color));
}

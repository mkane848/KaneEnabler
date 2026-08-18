/**
 * A stable, order-independent key for a combo, derived from its card names
 * rather than Commander Spellbook's own id — `spellbookId` is nullable and
 * its live contract is unverified (see docs/handoff.md's Phase 7). Two
 * lookups for the same combo, named in either order or found starting from
 * either card, must key identically; FNV-1a over the sorted, lowercased
 * names guarantees that without needing a crypto dependency for something
 * that only needs to be stable, not secure.
 */
export function comboKey(cardNames: string[]): string {
  const normalized = cardNames
    .map((name) => name.trim().toLowerCase())
    .sort()
    .join('|');

  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

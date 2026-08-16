/**
 * Color identity rules, shared by the app and the build-time card fetch.
 *
 * Plain .mjs rather than .ts so scripts/fetch-card-data.mjs can import it
 * directly — that script runs under bare node with no build step. The two
 * callers have to agree: the script decides which cards get into cards.json,
 * and cardCatalog.ts re-checks the same rule when reading it back, so a drift
 * between two copies would show up as cards silently appearing or vanishing.
 */

/** Jeskai — the White/Blue/Red color identity this deck's card pool is restricted to. */
export const JESKAI_COLORS = /** @type {readonly string[]} */ (['W', 'U', 'R']);

/**
 * Colorless cards (no colors/identity at all) are legal in any color identity.
 *
 * @param {string[] | undefined} colors
 * @param {readonly string[]} allowed
 * @returns {boolean}
 */
export function isWithinIdentity(colors, allowed) {
  if (!colors || colors.length === 0) return true;
  return colors.every((c) => allowed.includes(c));
}

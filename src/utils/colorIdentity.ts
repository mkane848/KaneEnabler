/** Jeskai — the White/Blue/Red color identity this deck's card pool is restricted to. */
export const JESKAI_COLORS = ['W', 'U', 'R'] as const;

/** Colorless cards (no colors/identity at all) are legal in any color identity. */
export function isWithinIdentity(colors: string[] | undefined, allowed: readonly string[]): boolean {
  if (!colors || colors.length === 0) return true;
  return colors.every(c => allowed.includes(c));
}

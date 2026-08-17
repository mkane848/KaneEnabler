/**
 * Which names a card can be written down as.
 *
 * People write "Adventurous Eater", not "Adventurous Eater // Have a Bite".
 * Scryfall stores the joined form, so a decklist naming one face has to be
 * resolved back to the whole card — see `card_face_names` in
 * import-scryfall.ts and `findCardsByNames` in db.ts.
 *
 * Lives apart from the import script so the rules can be tested without
 * running an import.
 */

/** The slice of a Scryfall card object these rules need. */
export interface NamedCardLike {
  name?: string;
  layout?: string;
  card_faces?: { name?: string }[];
}

export interface FaceNameEntry {
  /** Lowercased, ready for the name index. */
  faceNameLower: string;
  /** Position on the card. 0 is the front. */
  faceIndex: number;
}

/**
 * Layouts whose stored `name` joins two face names with " // ", and which a
 * player would refer to by one face alone.
 *
 * This was originally transform + modal_dfc only, on the reasoning that
 * split/adventure/flip cards share one physical face and so were "a different
 * case". True for rules purposes, irrelevant here: what matters is whether
 * the stored name contains a "//" nobody types. It does, which left 384
 * gameplay cards unfindable by the name printed on them — adventure (166),
 * split (137), prepare (55), flip (26). `prepare` is the layout behind the
 * reported "Adventurous Eater isn't matching" bug; it postdates the original
 * scoping, which is exactly why a closed allow-list of layouts silently rots.
 *
 * `double_faced_token` is deliberately absent: tokens are not deck entries,
 * so indexing them adds collision risk and no benefit. `art_series` never
 * reaches here — it's dropped as a non-gameplay object during import.
 */
export const MULTI_FACE_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'adventure',
  'split',
  'prepare',
  'flip',
]);

/**
 * The face names worth indexing for a card, with their positions.
 *
 * Empty for single-faced cards and for any layout outside
 * MULTI_FACE_LAYOUTS. A face whose name equals the card's full name is
 * skipped, since exact-name matching already covers it.
 */
export function faceNameEntries(card: NamedCardLike): FaceNameEntry[] {
  if (!card.layout || !MULTI_FACE_LAYOUTS.has(card.layout)) return [];
  if (!Array.isArray(card.card_faces)) return [];

  const fullNameLower = (card.name ?? '').toLowerCase();
  const entries: FaceNameEntry[] = [];

  card.card_faces.forEach((face, faceIndex) => {
    const faceNameLower = (face.name ?? '').toLowerCase();
    if (!faceNameLower || faceNameLower === fullNameLower) return;
    entries.push({ faceNameLower, faceIndex });
  });

  return entries;
}

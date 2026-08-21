/**
 * Reading a normalized field off a raw Scryfall bulk-data card object,
 * correctly accounting for double-faced/split/adventure/flip layouts.
 *
 * @typedef {Object} ScryfallCardFace
 * @property {string} [name]
 * @property {string} [type_line]
 * @property {string} [oracle_text]
 * @property {string} [mana_cost]
 * @property {string} [power]
 * @property {string} [toughness]
 * @property {Record<string, string>} [image_uris]
 *
 * @typedef {Object} ScryfallBulkCard
 * @property {string} [layout]
 * @property {string} [mana_cost]
 * @property {string} [power]
 * @property {string} [toughness]
 * @property {Record<string, string>} [image_uris]
 * @property {ScryfallCardFace[]} [card_faces]
 */

/**
 * Layouts with two distinct physical faces, each with its own picture —
 * transform and modal DFC only. Split, adventure, prepare, and flip cards
 * all print on one physical face, so there is no second image or a
 * meaningfully distinct back name for any of them.
 */
const TWO_SIDED_LAYOUTS = new Set(['transform', 'modal_dfc']);

/**
 * @param {string | undefined} layout
 * @returns {boolean}
 */
export function isTwoSidedLayout(layout) {
  return layout !== undefined && TWO_SIDED_LAYOUTS.has(layout);
}

/**
 * A card's own value for `field`, reading only the front face for every
 * multi-faced layout except `split`. Mirrors `frontFaceCharacteristics` in
 * `@mtg/rules` (CR 712.4/709.4) exactly, and for the same reason: a modal DFC
 * or adventurer card is cast as one face or the other, never both, so
 * joining faces (e.g. "{1}{G}" and "{3}{G}{G}" into "{1}{G} // {3}{G}{G}")
 * would show five pips for what is really one cost. A split card genuinely
 * has both halves' mana cost outside the stack (CR 709.3) — its top-level
 * value already reflects that combination correctly, so it stays unjoined.
 *
 * This can't simply prefer the top-level value when present: Scryfall's
 * top-level `mana_cost`/`power`/`toughness` for a split *or adventure* card
 * is already the two faces joined (e.g. Bonecrusher Giant's top-level
 * `mana_cost` is `"{2}{R} // {1}{R}"`), so checking `!== undefined` would
 * read that joined string for adventure too — the exact bug this function
 * exists to avoid, just for a different layout than modal DFC.
 *
 * @param {ScryfallBulkCard} card
 * @param {'mana_cost' | 'power' | 'toughness'} field
 * @returns {string | undefined}
 */
export function frontFaceField(card, field) {
  const faces = card.card_faces;
  const useFrontOnly = Array.isArray(faces) && faces.length > 0 && card.layout !== 'split';
  if (useFrontOnly) return faces[0]?.[field];
  return card[field];
}

/**
 * The image URI for a card's front face, at the given Scryfall image size
 * (e.g. 'small', 'normal', 'large'). A split/adventure/flip card has one
 * physical face and so a top-level `image_uris`, same as a single-faced
 * card; a transform/modal DFC has none, and falls back to its own front
 * face's picture.
 *
 * @param {ScryfallBulkCard} card
 * @param {string} size
 * @returns {string | null}
 */
export function frontImageUri(card, size) {
  return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null;
}

/**
 * The image URI for a card's back face, at the given size — null unless the
 * card is a genuinely two-sided layout (see `isTwoSidedLayout`).
 *
 * @param {ScryfallBulkCard} card
 * @param {string} size
 * @returns {string | null}
 */
export function backImageUri(card, size) {
  if (!isTwoSidedLayout(card.layout)) return null;
  return card.card_faces?.[1]?.image_uris?.[size] ?? null;
}

/**
 * The back face's own name — null unless the card is a genuinely two-sided
 * layout (see `isTwoSidedLayout`).
 *
 * @param {ScryfallBulkCard} card
 * @returns {string | null}
 */
export function backFaceName(card) {
  if (!isTwoSidedLayout(card.layout)) return null;
  return card.card_faces?.[1]?.name ?? null;
}

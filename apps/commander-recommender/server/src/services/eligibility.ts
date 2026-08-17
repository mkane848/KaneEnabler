/**
 * Which cards can legally be a commander, judged the way the command zone
 * actually sees them.
 *
 * Lives apart from `import-scryfall.ts` (its only caller) so it can be tested
 * against real card shapes without running an import — the rules here are
 * fiddly enough that "it looked right in the bulk file" is not good enough.
 */

/** The slice of a Scryfall card object these rules need. */
export interface ScryfallCardLike {
  layout?: string;
  type_line?: string;
  oracle_text?: string;
  card_faces?: { type_line?: string; oracle_text?: string }[];
}

export interface FaceCharacteristics {
  typeLine: string;
  oracleText: string;
}

/**
 * A card's characteristics in every zone except the battlefield.
 *
 * For a double-faced card that is the **front face alone** (CR 712.4): a
 * transforming card only has its back face's characteristics once it is on
 * the battlefield and transformed. In the command zone, Westvale Abbey is a
 * plain non-legendary Land — Ormendahl, Profane Prince simply isn't there
 * yet. Scryfall's top-level `type_line` for such a card is the two faces
 * joined ("Land // Legendary Creature — Demon"), so reading it whole sees
 * characteristics the card does not actually have where it matters.
 *
 * The same front-face reading is right for `flip` (Bushi Tenderfoot is not
 * legendary; only its flipped side is) and `adventure` (an adventurer card
 * is just its creature outside the stack).
 *
 * `split` is the one layout that must stay joined: a split card genuinely has
 * both halves' characteristics in every zone (CR 709.4), because it is one
 * face rather than two. Nothing about that changes eligibility in practice —
 * no split card is a creature — but reading only half of one would be wrong
 * on its own terms.
 */
export function frontFaceCharacteristics(card: ScryfallCardLike): FaceCharacteristics {
  const faces = card.card_faces;
  const useFrontOnly = Array.isArray(faces) && faces.length > 0 && card.layout !== 'split';

  if (useFrontOnly) {
    // useFrontOnly is only true when faces.length > 0.
    return {
      typeLine: faces![0]!.type_line ?? '',
      oracleText: faces![0]!.oracle_text ?? '',
    };
  }

  return {
    typeLine: card.type_line ?? '',
    oracleText:
      card.oracle_text ??
      (faces ?? [])
        .map((f) => f.oracle_text)
        .filter(Boolean)
        .join('\n'),
  };
}

/**
 * Whether a card may be a commander, per rule 903.3 plus the "can be your
 * commander" escape hatch some cards print.
 *
 * Judged entirely on `frontFaceCharacteristics` — see there for why reading
 * a double-faced card whole is wrong.
 */
export function isCommanderEligible(card: ScryfallCardLike): boolean {
  const { typeLine, oracleText } = frontFaceCharacteristics(card);

  const isLegendary = typeLine.includes('Legendary');
  // 903.3, updated by the Edge of Eternities set: a commander must be a
  // creature, a Vehicle, or a Spacecraft — not only a creature. An
  // unanimated Vehicle's type line is just "Artifact — Vehicle", no
  // "Creature" in sight, so checking for Creature alone silently excluded
  // every legal Vehicle and Spacecraft commander.
  //
  // No power/toughness condition: verified against Scryfall's live
  // legality data before adding one, since "with a power/toughness box"
  // is how this got described secondhand. "The Eternity Elevator" (Edge of
  // Eternities) is a real, Commander-legal Spacecraft with no printed
  // power/toughness at all — its stats come entirely from the Station
  // mechanic's counters — so gating on power/toughness being present would
  // have wrongly excluded a card that is actually legal.
  //
  // Word-boundary matched rather than substring, per the same reasoning as
  // parseCreatureTypes's Creature/Kindred/Tribal check.
  const isEligibleType = /\b(Creature|Vehicle|Spacecraft)\b/.test(typeLine);

  // Read off the front face too: an ability granting commander-hood only
  // applies where the card actually has that ability, and a back face has
  // none of its abilities while the card sits in the command zone.
  const mentionsCommander = /can be your commander/i.test(oracleText);

  return (isLegendary && isEligibleType) || mentionsCommander;
}

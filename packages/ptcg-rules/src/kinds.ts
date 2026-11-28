/**
 * What kind of card a snapshot card is, for the deck-construction rules.
 *
 * TCGdex's structured fields are the first answer, but several are patchy in
 * the data (measured against the 2026-11 snapshot, see each note), so most of
 * these fall back to something the card itself prints. Each fallback is
 * pinned by a test against the real cards that needed it.
 */
import type { PtcgCard } from './card';
import legacyAceSpecs from './data/legacy-ace-specs.json';

export const isPokemon = (card: PtcgCard): boolean => card.category === 'Pokemon';
export const isTrainer = (card: PtcgCard): boolean => card.category === 'Trainer';
export const isEnergy = (card: PtcgCard): boolean => card.category === 'Energy';

/**
 * Basic Energy prints no rules text; every Special Energy does. That is a
 * sharper test than TCGdex's `energyType`, which marks Ignition, Prism,
 * Reversal and Team Rocket's Energy (all Special, all with text) as `Normal`,
 * and leaves 35 basic prints unmarked.
 */
export function isBasicEnergy(card: PtcgCard): boolean {
  return isEnergy(card) && card.energyType !== 'Special' && !card.effect?.trim();
}

/**
 * 834 Pokémon in the snapshot (mostly Black & White and EX era) have no
 * `stage`. One that evolves from nothing is Basic; one that evolves from
 * something isn't, whatever its exact stage.
 */
export function isBasicPokemon(card: PtcgCard): boolean {
  if (!isPokemon(card)) return false;
  if (card.stage) return card.stage === 'Basic';
  return !card.evolveFrom;
}

const LEGACY_ACE_SPEC_IDS: ReadonlySet<string> = new Set(legacyAceSpecs.cards.map((c) => c.id));

/**
 * Scarlet & Violet onward, TCGdex marks ACE SPEC cards only by their
 * `ACE SPEC Rare` rarity (its `trainerType: 'Ace Spec'` is never set). The
 * Black & White originals carry plain `Rare`, so they come from a vendored
 * list — see data/legacy-ace-specs.json for where it was read from.
 */
export function isAceSpec(card: PtcgCard): boolean {
  return card.rarity === 'ACE SPEC Rare' || LEGACY_ACE_SPEC_IDS.has(card.id);
}

export function isRadiant(card: PtcgCard): boolean {
  return card.rarity === 'Radiant Rare' || /^Radiant /.test(card.name);
}

/** Prism Star cards print ◇ after the name; TCGdex has no field for it. */
export const isPrismStar = (card: PtcgCard): boolean => card.name.includes('◇');

const RULE_BOX_SUFFIXES: ReadonlySet<string> = new Set(['ex', 'EX', 'GX', 'TAG TEAM-GX', 'V']);
const RULE_BOX_STAGES: ReadonlySet<string> = new Set(['VMAX', 'VSTAR', 'V-UNION', 'BREAK']);
/**
 * 52 Black & White-onward cards print a rule-box mechanic in their name but
 * lack the matching `suffix` (Mega Evolution EX promos, late Sun & Moon GX
 * secret rares). Read from the name only as a fallback: it would misfire on
 * older names like Diamond & Pearl's "Unown V", which is why the structured
 * fields come first and why only GLC — whose pool starts at Black & White —
 * asks this question.
 */
const RULE_BOX_NAME = /(?:-EX|-GX| EX| GX| ex| V| VMAX| VSTAR| V-UNION| BREAK)$|TAG TEAM/;

/**
 * Per Gym Leader Challenge's FAQ (data/glc.json `ruleBoxFaq`): Pokémon V, EX,
 * GX, BREAK, Radiant Pokémon, ACE SPECs and Prism Stars "including Prism Star
 * Trainer and Energy cards"; Ancient Trait Pokémon do not. VMAX, VSTAR and
 * V-UNION are Pokémon V. Scarlet & Violet's lowercase "ex" isn't named in
 * that list; it's counted on the strength of the official Rule Box rule,
 * pending that rule's quote (official.ts `ruleBox`).
 */
export function hasRuleBox(card: PtcgCard): boolean {
  if (isAceSpec(card) || isPrismStar(card)) return true;
  if (!isPokemon(card)) return false;
  if (isRadiant(card)) return true;
  if (card.suffix && RULE_BOX_SUFFIXES.has(card.suffix)) return true;
  if (card.stage && RULE_BOX_STAGES.has(card.stage)) return true;
  return RULE_BOX_NAME.test(card.name);
}

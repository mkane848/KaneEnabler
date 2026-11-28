/**
 * Deck validation: every rule a list breaks, not just the first.
 *
 * Each violation carries the citation it enforces, so the app can show why.
 * Standard, Expanded and Unlimited share the official construction rules
 * (official.ts); Gym Leader Challenge replaces the copy limit with singleton
 * and adds its own restrictions (data/glc.json).
 */
import type { PtcgCard } from './card';
import glc from './data/glc.json';
import {
  hasRuleBox,
  isAceSpec,
  isBasicEnergy,
  isBasicPokemon,
  isPokemon,
  isPrismStar,
  isRadiant,
} from './kinds';
import type { Format, Legality } from './legality';
import { OFFICIAL, type Citation } from './official';

export const DECK_SIZE = 60;
export const COPY_LIMIT = 4;

export interface DeckEntry {
  card: PtcgCard;
  count: number;
}

export type ViolationCode =
  | 'deck-size'
  | 'no-basic-pokemon'
  | 'not-legal'
  | 'copy-limit'
  | 'ace-spec'
  | 'radiant'
  | 'prism-star'
  | 'glc-rule-box'
  | 'glc-ace-spec'
  | 'glc-type';

export interface Violation {
  code: ViolationCode;
  message: string;
  /** The cards responsible, where the rule is about particular cards. */
  cardIds: string[];
  citation: Citation;
}

const GLC_SOURCE = glc.source.rules;
const glcCite = (quote: string): Citation => ({ source: GLC_SOURCE, quote });
const GLC_FAQ = (quote: string): Citation => ({ source: glc.source.faq, quote });

/** Sums counts per card name — the game counts copies by name, across prints. */
function countByName(entries: readonly DeckEntry[]): Map<string, { count: number; ids: string[] }> {
  const byName = new Map<string, { count: number; ids: string[] }>();
  for (const { card, count } of entries) {
    const slot = byName.get(card.name) ?? { count: 0, ids: [] };
    slot.count += count;
    slot.ids.push(card.id);
    byName.set(card.name, slot);
  }
  return byName;
}

/**
 * The Pokémon types every Pokémon in the deck shares. GLC: "Your deck can
 * only contain one type (color) of Pokémon", and a dual-type card fits a deck
 * of either of its types — so the deck is valid when this is non-empty.
 */
export function sharedPokemonTypes(entries: readonly DeckEntry[]): string[] {
  const pokemon = entries.filter((e) => isPokemon(e.card));
  const [first, ...rest] = pokemon;
  if (!first) return [];
  return (first.card.types ?? [])
    .filter((type) => rest.every((e) => e.card.types?.includes(type)))
    .sort();
}

export function validateDeck(
  entries: readonly DeckEntry[],
  format: Format,
  legality: Legality,
): Violation[] {
  const violations: Violation[] = [];
  const live = entries.filter((e) => e.count > 0);
  const total = live.reduce((n, e) => n + e.count, 0);
  const isGlc = format === 'glc';

  if (total !== DECK_SIZE) {
    violations.push({
      code: 'deck-size',
      message: `A deck is exactly ${DECK_SIZE} cards; this one has ${total}.`,
      cardIds: [],
      citation: isGlc ? glcCite(glc.quotes.deckSize) : OFFICIAL.deckSize,
    });
  }

  if (!live.some((e) => isBasicPokemon(e.card))) {
    violations.push({
      code: 'no-basic-pokemon',
      message: 'A deck needs at least one Basic Pokémon.',
      cardIds: [],
      citation: OFFICIAL.basicPokemon,
    });
  }

  const illegal = live.filter((e) => !legality.isLegal(e.card, format)).map((e) => e.card.id);
  if (illegal.length > 0) {
    violations.push({
      code: 'not-legal',
      message: `${illegal.length} card${illegal.length === 1 ? ' is' : 's are'} not legal in this format.`,
      cardIds: illegal,
      citation: isGlc ? glcCite(glc.quotes.pool) : OFFICIAL.banList,
    });
  }

  const limit = isGlc ? 1 : COPY_LIMIT;
  for (const [name, { count, ids }] of countByName(live.filter((e) => !isBasicEnergy(e.card)))) {
    if (count > limit) {
      violations.push({
        code: 'copy-limit',
        message: `${count} copies of ${name}; the limit is ${limit}.`,
        cardIds: ids,
        citation: isGlc ? glcCite(glc.quotes.singleton) : OFFICIAL.copyLimit,
      });
    }
  }

  const aceSpecs = live.filter((e) => isAceSpec(e.card));
  if (isGlc && aceSpecs.length > 0) {
    violations.push({
      code: 'glc-ace-spec',
      message: 'ACE SPEC cards are not allowed in Gym Leader Challenge.',
      cardIds: aceSpecs.map((e) => e.card.id),
      citation: glcCite(glc.quotes.aceSpec),
    });
  } else if (aceSpecs.reduce((n, e) => n + e.count, 0) > 1) {
    violations.push({
      code: 'ace-spec',
      message: 'A deck may contain only one ACE SPEC card.',
      cardIds: aceSpecs.map((e) => e.card.id),
      citation: OFFICIAL.aceSpec,
    });
  }

  const radiants = live.filter((e) => isRadiant(e.card));
  if (!isGlc && radiants.reduce((n, e) => n + e.count, 0) > 1) {
    violations.push({
      code: 'radiant',
      message: 'A deck may contain only one Radiant Pokémon.',
      cardIds: radiants.map((e) => e.card.id),
      citation: OFFICIAL.radiant,
    });
  }

  if (!isGlc) {
    for (const [name, { count, ids }] of countByName(live.filter((e) => isPrismStar(e.card)))) {
      if (count > 1) {
        violations.push({
          code: 'prism-star',
          message: `Only one copy of a Prism Star card with the same name; ${name} has ${count}.`,
          cardIds: ids,
          citation: OFFICIAL.prismStar,
        });
      }
    }
  }

  if (isGlc) {
    // ACE SPECs have their own violation above; this is the rest of the rule box.
    const ruleBox = live.filter((e) => hasRuleBox(e.card) && !isAceSpec(e.card));
    if (ruleBox.length > 0) {
      violations.push({
        code: 'glc-rule-box',
        message: 'Cards with a Rule Box are not allowed in Gym Leader Challenge.',
        cardIds: ruleBox.map((e) => e.card.id),
        citation: GLC_FAQ(glc.quotes.ruleBoxFaq),
      });
    }
    if (live.some((e) => isPokemon(e.card)) && sharedPokemonTypes(live).length === 0) {
      violations.push({
        code: 'glc-type',
        message: 'Every Pokémon must share one type (a dual-type Pokémon fits either).',
        cardIds: live.filter((e) => isPokemon(e.card)).map((e) => e.card.id),
        citation: glcCite(glc.quotes.type),
      });
    }
  }

  return violations;
}

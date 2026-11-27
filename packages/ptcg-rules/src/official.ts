/**
 * Citations for the official Pokémon TCG rules these primitives implement.
 *
 * pokemon.com sits behind bot protection that this project's sandbox can't
 * (and shouldn't try to) get through, so the official text is supplied by the
 * repo owner rather than fetched. Until it is, each citation below carries
 * `PENDING_QUOTE` instead of a quote, and `official.test.ts` lists what is
 * still outstanding. The rules themselves are the long-standing construction
 * rules; the point of the quote is that nobody has to take that on trust.
 */
export const PENDING_QUOTE = 'PENDING-QUOTE' as const;

export interface Citation {
  /** The document the rule comes from. */
  source: string;
  /** Verbatim text from it, or PENDING_QUOTE until supplied. */
  quote: string;
}

const RULEBOOK =
  'Pokémon TCG rulebook (current: Delta Reign, www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/dlr_rulebook_en.pdf)';
const BAN_LIST = 'Pokémon TCG banned card list (www.pokemon.com/us/pokemon-tcg-banned-card-list)';

export const OFFICIAL = {
  deckSize: { source: RULEBOOK, quote: PENDING_QUOTE },
  copyLimit: { source: RULEBOOK, quote: PENDING_QUOTE },
  basicPokemon: { source: RULEBOOK, quote: PENDING_QUOTE },
  aceSpec: { source: RULEBOOK, quote: PENDING_QUOTE },
  radiant: { source: RULEBOOK, quote: PENDING_QUOTE },
  prismStar: { source: RULEBOOK, quote: PENDING_QUOTE },
  ruleBox: { source: RULEBOOK, quote: PENDING_QUOTE },
  /** Basic Energy is legal in every format; no basic Energy print in the snapshot carries a regulation mark. */
  basicEnergyLegal: { source: RULEBOOK, quote: PENDING_QUOTE },
  /** Whether an older print is legal wherever a same-name, same-text reprint is. Until quoted, legality is per print. */
  reprints: { source: RULEBOOK, quote: PENDING_QUOTE },
  banList: { source: BAN_LIST, quote: PENDING_QUOTE },
} satisfies Record<string, Citation>;

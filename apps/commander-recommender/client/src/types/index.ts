export interface BracketEstimateDTO {
  label: string;
  range: string;
  note: string;
}

/** One of your cards, cited as a reason a commander was suggested. */
export interface SupportingCardDTO {
  name: string;
  quantity: number;
  typeLine: string | null;
  isGameChanger: boolean;
  manaValue: number | null;
  /** Printed cost, e.g. "{2}{B}{B}". Null for lands and anything without one. */
  manaCost: string | null;
  imageUri: string | null;
  /** Second face of a transform/modal DFC, for the art preview's flip control. */
  backImageUri: string | null;
  backName: string | null;
  scryfallUri: string | null;
}

export interface ThemeSupportDTO {
  key: string;
  label: string;
  description: string;
  cards: SupportingCardDTO[];
}

export interface KindredSupportDTO {
  type: string;
  cards: SupportingCardDTO[];
}

export interface KeywordSupportDTO {
  keyword: string;
  cards: SupportingCardDTO[];
}

/**
 * The wire shape of the above, before rehydration.
 *
 * A cited card is one of *your* cards, so the same handful repeats under
 * every commander — 26,618 citations of 28 cards on one measured list. The
 * server sends them once in `cardIndex` and cites positions; `client.ts`
 * swaps the positions back for objects on receipt, so nothing below the API
 * layer ever sees this shape.
 */
type Cited<T extends { cards: SupportingCardDTO[] }> = Omit<T, 'cards'> & { cards: number[] };

export type WireCommanderSuggestionDTO = Omit<
  CommanderSuggestionDTO,
  'themeSupport' | 'kindredSupport' | 'keywordSupport' | 'gameChangerCards'
> & {
  themeSupport: Cited<ThemeSupportDTO>[];
  kindredSupport: Cited<KindredSupportDTO>[];
  keywordSupport: Cited<KeywordSupportDTO>[];
  gameChangerCards: number[];
};

export type WireRecommendResponse = Omit<RecommendResponse, 'suggestions'> & {
  cardIndex: SupportingCardDTO[];
  suggestions: WireCommanderSuggestionDTO[];
};

/** One card of a commander unit — a solo commander has one, a Partner/Background pair has two. */
export interface CommanderCardDTO {
  oracleId: string;
  name: string;
  imageUri: string | null;
  /** Second face of a transform/modal DFC — null for single-faced cards. */
  backImageUri: string | null;
  backName: string | null;
  colorIdentity: string[];
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  manaValue: number | null;
  power: string | null;
  toughness: string | null;
  scryfallUri: string | null;
  isGameChanger: boolean;
}

export interface CommanderSuggestionDTO {
  /** Stable id for the unit (both cards' oracle ids, sorted and joined) — use this, not a card's own oracleId, as the row key. */
  unitId: string;
  cards: CommanderCardDTO[];
  colorIdentity: string[];
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  matchedKeywords: string[];
  includedCardCount: number;
  themeSupport: ThemeSupportDTO[];
  kindredSupport: KindredSupportDTO[];
  keywordSupport: KeywordSupportDTO[];
  gameChangerCards: SupportingCardDTO[];
  gameChangerCount: number;
  bracket: BracketEstimateDTO;
}

export interface ComboDTO {
  id: string | null;
  permalink: string | null;
  cards: string[];
  produces: string[];
  description: string | null;
  /** Pieces you don't have. Empty for combos you can already assemble. */
  missing: string[];
}

export interface ComboLookupResponse {
  ready: ComboDTO[];
  almost: ComboDTO[];
  cached: boolean;
  searchedCardCount: number;
}

/** What a card does for an archetype — see server/src/services/signals.ts. */
export type RoleDTO = 'is' | 'produces' | 'consumes' | 'rewards' | 'amplifies';

/** One of your cards, listed under the theme it plays into. */
export interface SlotCardDTO extends SupportingCardDTO {
  roles: RoleDTO[];
}

/** A card you don't have, offered to fill a slot your list can't. */
export interface SlotSuggestionDTO extends SupportingCardDTO {
  oracleId: string;
  /** Your other themes this card would also feed. */
  alsoFits: string[];
}

/** One link in an archetype's chain, and whether the list has it. */
export interface SlotStatusDTO {
  key: string;
  label: string;
  description: string;
  cards: SlotCardDTO[];
  suggestions: SlotSuggestionDTO[];
  minimum: number;
  filled: boolean;
  /** The slot this archetype is *usually* short on. A low-confidence hint,
   * not a measurement — the UI has to say so. */
  commonlyMissing: boolean;
}

export interface DeckThemeDTO {
  archetype: string;
  qualifier?: string;
  label: string;
  description: string;
  cardCount: number;
  cards: SlotCardDTO[];
  /** Empty for archetypes with no chain to break, like kindred. */
  slots: SlotStatusDTO[];
  complete: boolean;
}

/** What your list is doing, independent of any commander. */
export interface DeckAnalysisDTO {
  themes: DeckThemeDTO[];
}

export interface RecommendResponse {
  totalParsed: number;
  totalMatched: number;
  /** Copies dropped because Commander is singleton — see services/singleton.ts. */
  ignoredCopies: number;
  notFound: string[];
  /** True when no commander showed a real pattern, so `suggestions` is just
   * the closest few rather than a confident ranking. */
  weakMatchesOnly: boolean;
  /** The list's own strongest archetypes, and whether each one functions. */
  deck: DeckAnalysisDTO;
  suggestions: CommanderSuggestionDTO[];
}

/** Server-side facts about the deployment itself, from /api/meta. */
export interface ServerMeta {
  /** Scryfall's publish time for the bulk snapshot the card database was
   * built from. Null when the database predates snapshot tracking. */
  cardDataUpdatedAt: string | null;
  /** When that import ran. Null for the same reason. */
  importedAt: string | null;
}

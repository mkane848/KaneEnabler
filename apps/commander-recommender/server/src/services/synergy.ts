/**
 * Scoring: which commander best fits a submitted card list, and why.
 *
 * The "what counts as a synergy" question lives in `signals.ts` — this file
 * is about turning the signals a commander and a list share into a ranking.
 * The split matters: adding an archetype should mean editing a catalog, not
 * touching the scorer.
 */
import type { CardRow } from '../types';
import type { CommanderUnit } from './partners';
import {
  buildCardFacts,
  buildVocabulary,
  detectSignals,
  hasActiveRole,
  signalKey,
  type CardFacts,
  type Role,
  type SignalMatch,
  type Vocabulary,
} from './signals';

export interface OwnedCard {
  row: CardRow;
  quantity: number;
}

export interface CollectionProfile {
  colorCounts: Record<string, number>;
  /** Creature types and keywords actually present in the list. Signal
   * detection is scoped to these — a type nobody owns can't support
   * anything, and scoping keeps the per-candidate work small. */
  creatureTypes: string[];
  keywords: string[];
  /** Lookup tables built once from the two lists above, so signal detection
   * costs one map lookup per word rather than a regex per type in Magic. */
  vocabulary: Vocabulary;
  /** Cards participating in each archetype, in any role. Indexed by archetype
   * rather than by full signal key so a qualified commander signal can filter
   * a small bucket instead of rescanning the list. */
  archetypeCards: Record<string, OwnedCard[]>;
  /** Per-card facts, kept for qualifier checks during scoring. */
  factsByCard: Map<string, CardFacts>;
  totalCards: number;
}

/** One of the user's cards, as cited in a suggestion's explanation. */
export interface SupportingCard {
  name: string;
  quantity: number;
  typeLine: string | null;
  isGameChanger: boolean;
  manaValue: number | null;
  /** Printed cost, e.g. "{2}{B}{B}". Null for lands and anything without
   * one. Carried alongside manaValue because the two answer different
   * questions: manaValue sorts, manaCost is what a player reads. */
  manaCost: string | null;
  imageUri: string | null;
  backImageUri: string | null;
  backName: string | null;
  scryfallUri: string | null;
}

/** An archetype the commander shares with the list. */
export interface ThemeSupport {
  key: string;
  label: string;
  description: string;
  cards: SupportingCard[];
}

/** A creature type the commander cares about and the list can field. */
export interface KindredSupport {
  type: string;
  cards: SupportingCard[];
}

/** A keyword the commander actively cares about — grants it, or triggers off
 * it. Merely sharing a keyword is not a signal; see `signals.ts`. */
export interface KeywordSupport {
  keyword: string;
  cards: SupportingCard[];
}

export interface CommanderSuggestion {
  cards: CardRow[];
  score: number;
  matchedThemes: string[];
  matchedCreatureTypes: string[];
  matchedKeywords: string[];
  includedCardCount: number;
  themeSupport: ThemeSupport[];
  kindredSupport: KindredSupport[];
  keywordSupport: KeywordSupport[];
  gameChangerCards: SupportingCard[];
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSupportingCard({ row, quantity }: OwnedCard): SupportingCard {
  return {
    name: row.name,
    quantity,
    typeLine: row.type_line,
    isGameChanger: !!row.game_changer,
    manaValue: row.cmc,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    backImageUri: row.back_image_uri ?? null,
    backName: row.back_name ?? null,
    scryfallUri: row.scryfall_uri,
  };
}

export function buildCollectionProfile(owned: OwnedCard[]): CollectionProfile {
  const colorCounts: Record<string, number> = {};
  const creatureTypeSet = new Set<string>();
  const keywordSet = new Set<string>();
  let totalCards = 0;

  // First pass: what vocabulary does this list even contain? Signal detection
  // needs to know which creature types and keywords are worth looking for
  // before it can look for them.
  for (const { row, quantity } of owned) {
    totalCards += quantity;
    for (const color of parseJsonArray(row.color_identity)) {
      colorCounts[color] = (colorCounts[color] ?? 0) + quantity;
    }
    for (const type of parseJsonArray(row.creature_types)) creatureTypeSet.add(type);
    for (const keyword of parseJsonArray(row.keywords)) keywordSet.add(keyword);
  }

  const creatureTypes = [...creatureTypeSet];
  const keywords = [...keywordSet];

  // Second pass: what does each card actually do?
  const archetypeCards: Record<string, OwnedCard[]> = {};
  const factsByCard = new Map<string, CardFacts>();

  const vocabulary = buildVocabulary(creatureTypes, keywords);

  for (const entry of owned) {
    const facts = buildCardFacts(entry.row, vocabulary);
    factsByCard.set(entry.row.oracle_id, facts);
    const seen = new Set<string>();
    for (const signal of detectSignals(facts, vocabulary)) {
      // One bucket entry per archetype, even if a card matches it at several
      // qualifiers — the bucket is a candidate set, not a count.
      if (seen.has(signal.archetype)) continue;
      seen.add(signal.archetype);
      (archetypeCards[signal.archetype] ??= []).push(entry);
    }
  }

  return { colorCounts, creatureTypes, keywords, vocabulary, archetypeCards, factsByCard, totalCards };
}

// A commander unit is jointly "the commander" (702.124e), so signals are
// unioned across both cards rather than checked per-card: a Partner pair
// matches anything either half of it would match solo.
function unitColorIdentity(unit: CommanderUnit): Set<string> {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const c of parseJsonArray(card.color_identity)) set.add(c);
  }
  return set;
}

/** Every signal the unit shows, with roles unioned across its cards. */
function unitSignals(unit: CommanderUnit, profile: CollectionProfile): SignalMatch[] {
  const merged = new Map<string, SignalMatch>();
  for (const card of unit.cards) {
    const facts = buildCardFacts(card, profile.vocabulary);
    for (const signal of detectSignals(facts, profile.vocabulary)) {
      const key = signalKey(signal);
      const existing = merged.get(key);
      if (existing) {
        existing.roles = [...new Set<Role>([...existing.roles, ...signal.roles])];
      } else {
        merged.set(key, { ...signal, roles: [...signal.roles] });
      }
    }
  }
  return [...merged.values()];
}

/**
 * Whether a card from the list can be cited in support of a commander's
 * signal.
 *
 * An unqualified signal accepts any card that participates in the archetype.
 * A *qualified* one additionally requires the card to be of that subtype —
 * Sliver Gravemother's reanimation only pays off Slivers, so a non-Sliver
 * creature in your graveyard supports nothing.
 */
function supporterMatches(signal: SignalMatch, facts: CardFacts | undefined): boolean {
  if (!signal.qualifier) return true;
  if (!facts) return false;
  if (signal.qualifierKind === 'creatureType') {
    return facts.creatureTypes.includes(signal.qualifier) || facts.producedTokenTypes.includes(signal.qualifier);
  }
  if (signal.qualifierKind === 'keyword') {
    return facts.keywords.includes(signal.qualifier);
  }
  return true;
}

// Require at least this many *citable* cards — i.e. after narrowing to this
// specific commander's own color identity, not the whole list's global
// count — for a signal to count. A signal below this is dropped from scoring
// entirely, not just hidden: a commander ranked on something the user can't
// verify is a commander ranked on nothing.
const MIN_SIGNAL_COUNT = 3;

// A second, higher bar: a signal citing this many distinct cards is not just
// real but *deep* enough to earn the bonus below.
const DEEP_SIGNAL_COUNT = 5;

// How much each card beyond DEEP_SIGNAL_COUNT adds, flat — not scaled by
// density. Density alone means a deep signal on a 300-card list is worth
// almost nothing even though 8 supporting cards is a real deck's worth of a
// theme; the bonus is measured in the cards themselves.
const DEPTH_BONUS_PER_CARD = 1;

// Each signal past the strongest is discounted by this factor, so a wide,
// generic spread of archetypes can no longer out-accumulate one deep,
// specific synergy. An infinite run of equal signals converges to
// 1 / (1 - factor), so 0.7 caps pure breadth at ~3.3x the best single match.
const DIMINISHING_FACTOR = 0.7;

/**
 * Scores each candidate commander against the collection profile.
 *
 * A candidate needs a non-zero color-identity overlap AND at least one signal
 * it *actively* participates in — see `ACTIVE_ROLES` in signals.ts. Merely
 * being a Goblin, or merely having Trample, never qualifies anything.
 *
 * Only cards that fit the commander's color identity are cited, since a card
 * you couldn't legally run under that commander is not a reason to pick it.
 * Colour identity decides which cards are eligible and scores nothing by
 * itself — breadth of identity is what lets a commander play your cards,
 * never a reason to prefer one.
 */
export function scoreCommanders(
  units: CommanderUnit[],
  profile: CollectionProfile,
  owned: OwnedCard[]
): CommanderSuggestion[] {
  const suggestions: CommanderSuggestion[] = [];

  for (const unit of units) {
    const identitySet = unitColorIdentity(unit);
    const fitsIdentity = ({ row }: OwnedCard) =>
      parseJsonArray(row.color_identity).every((c) => identitySet.has(c));

    // Two counts on purpose. includedCardCount sums quantity and is what the
    // user is shown ("Fits N cards from your list"). The density denominator
    // counts *distinct* cards, so it shares units with the support lists.
    //
    // The denominator is every identity-fitting card, lands included. An
    // alternative — excluding lands, on the grounds that they're
    // infrastructure every deck needs equally rather than evidence of fit —
    // is recorded in handoff.md as a future avenue, not taken here.
    let includedCardCount = 0;
    let includedDistinctCount = 0;
    for (const entry of owned) {
      if (fitsIdentity(entry)) {
        includedCardCount += entry.quantity;
        includedDistinctCount += 1;
      }
    }
    if (includedCardCount === 0) continue;

    // Only signals the unit actively engages with. This one filter is the
    // generalised "cares, not shares" rule: it covers kindred (Silas Renn is
    // a Human but no Human commander), keywords (having Trample is not a
    // deck), and every archetype at once.
    const active = unitSignals(unit, profile).filter((s) => hasActiveRole(s.roles));

    const matched: { signal: SignalMatch; cards: SupportingCard[] }[] = [];
    for (const signal of active) {
      const bucket = profile.archetypeCards[signal.archetype] ?? [];
      const cards = bucket
        .filter((entry) => fitsIdentity(entry) && supporterMatches(signal, profile.factsByCard.get(entry.row.oracle_id)))
        .map(toSupportingCard);
      if (cards.length >= MIN_SIGNAL_COUNT) matched.push({ signal, cards });
    }

    if (matched.length === 0) continue;

    const gameChangerCards = owned
      .filter((entry) => entry.row.game_changer && fitsIdentity(entry))
      .map(toSupportingCard);

    const pool = Math.max(includedDistinctCount, 1);
    const density = (supporting: number) => supporting / pool;

    // Breadth: every signal contributes, but each past the strongest is worth
    // less than the last. Depth: a flat bonus per card beyond the deep-signal
    // floor, never diluted by how large the rest of the list is.
    const breadthScore = matched
      .map(({ signal, cards }) => density(cards.length) * signal.weight)
      .sort((a, b) => b - a)
      .reduce((sum, raw, rank) => sum + raw * DIMINISHING_FACTOR ** rank, 0);

    const depthScore = matched.reduce(
      (sum, { cards }) => sum + Math.max(0, cards.length - DEEP_SIGNAL_COUNT + 1) * DEPTH_BONUS_PER_CARD,
      0
    );

    // Mapped back onto the three support lists the API and client already
    // speak. Kindred and keyword-care are the two qualifier-generated
    // families; everything else is an archetype.
    const kindredSupport: KindredSupport[] = matched
      .filter(({ signal }) => signal.archetype === 'kindred')
      .map(({ signal, cards }) => ({ type: signal.qualifier!, cards }));

    const keywordSupport: KeywordSupport[] = matched
      .filter(({ signal }) => signal.archetype === 'keywordCare')
      .map(({ signal, cards }) => ({ keyword: signal.qualifier!, cards }));

    const themeSupport: ThemeSupport[] = matched
      .filter(({ signal }) => signal.archetype !== 'kindred' && signal.archetype !== 'keywordCare')
      .map(({ signal, cards }) => ({
        key: signalKey(signal),
        label: signal.label,
        description: signal.description,
        cards,
      }));

    suggestions.push({
      cards: unit.cards,
      score: breadthScore + depthScore,
      matchedThemes: themeSupport.map((t) => t.label),
      matchedCreatureTypes: kindredSupport.map((k) => k.type),
      matchedKeywords: keywordSupport.map((k) => k.keyword),
      includedCardCount,
      themeSupport,
      kindredSupport,
      keywordSupport,
      gameChangerCards,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

/**
 * How many suggestions to fall back to when none of them clear the quality
 * bar. One page's worth — enough to be useful, few enough that it reads as
 * "here's the closest we found" rather than a real ranking.
 */
const WEAK_MATCH_FALLBACK = 12;

/** Every signal's supporting-card count, across all three families. */
function signalSizes(suggestion: CommanderSuggestion): number[] {
  return [
    ...suggestion.themeSupport.map((t) => t.cards.length),
    ...suggestion.kindredSupport.map((k) => k.cards.length),
    ...suggestion.keywordSupport.map((k) => k.cards.length),
  ];
}

/**
 * Whether a suggestion is worth showing, as opposed to a coincidence.
 *
 * A commander whose entire case is *one* signal sitting at exactly
 * MIN_SIGNAL_COUNT has told us nothing: on a real graveyard list, 877
 * commanders came back matching the same one archetype on the same three
 * cards, every one scoring between 3.3 and 5.0. Sorting that is meaningless
 * — they are genuinely indistinguishable, because they are all just "a
 * commander that sacrifices creatures".
 *
 * So the bar is depth *or* breadth: one signal deep enough to matter, or
 * more than one signal at all. Note this is a structural test rather than a
 * score threshold. A fixed score floor cannot work here — the same number
 * that trims a focused kindred list (top score 51.9) wipes out every result
 * for a list whose whole range is 3.3 to 5.0.
 */
function isMeaningfulMatch(suggestion: CommanderSuggestion): boolean {
  const sizes = signalSizes(suggestion);
  return sizes.length >= 2 || sizes.some((size) => size >= DEEP_SIGNAL_COUNT);
}

export interface SelectedSuggestions {
  suggestions: CommanderSuggestion[];
  /**
   * True when nothing cleared the bar and these are just the closest
   * matches. The caller should say so rather than presenting them as
   * confident recommendations.
   */
  weakMatchesOnly: boolean;
}

/**
 * Narrows scored suggestions to the ones worth showing.
 *
 * Deliberately not a cap on how many come back: a list with a genuinely deep
 * theme should return everything that fits it. What gets cut is the long
 * tail of commanders matching one bare-minimum signal, which is what made
 * result counts run to four figures.
 *
 * When *nothing* clears the bar the list simply has no strong pattern. That
 * is worth saying out loud, but not worth answering with an empty page, so a
 * short flagged fallback comes back instead.
 */
export function selectSuggestions(scored: CommanderSuggestion[]): SelectedSuggestions {
  const meaningful = scored.filter(isMeaningfulMatch);
  if (meaningful.length > 0) return { suggestions: meaningful, weakMatchesOnly: false };
  return { suggestions: scored.slice(0, WEAK_MATCH_FALLBACK), weakMatchesOnly: true };
}

/**
 * Coverage: making sure every card in a submitted pool gets *some* commander
 * recommended for it, not just the ones that clear `synergy.ts`'s two bars.
 *
 * A submitted card list is a pool, not a deck-in-progress — see
 * `docs/recommendation-coverage.md` for the bug this fixes (a mono-black
 * card in a rainbow pool never reaching `scored` at all, so the Black filter
 * comes back empty even though the list contains a mono-black commander).
 * `MIN_SIGNAL_COUNT`/`isMeaningfulMatch` stay exactly as they are — they
 * exist to keep a wide pool from returning four-figure result counts — this
 * runs underneath them as a second, clearly-labelled tier, not a lower bar
 * on the first one.
 */
import { isWithinColorIdentity } from '@mtg/rules';
import { parseJsonArray, type CardRow } from '../types';
import { unitKey, type CommanderUnit } from './partners';
import { hasActiveRole, type SignalMatch } from './signals';
import {
  ownSignalContains,
  scoreCommanders,
  toSupportingCard,
  type CollectionProfile,
  type CommanderSuggestion,
  type OwnedCard,
} from './synergy';

export type CoverageReason = 'owned' | 'covers';

export interface CoverageSuggestion extends CommanderSuggestion {
  coverageReason: CoverageReason;
  /** oracle_ids of the submitted cards this pick rescues — the unit's own
   * cards for an 'owned' pick (owning it is what covers it), plus whatever
   * real synergy (`citedOracleIds`) either tier found on top of that. */
  coveredCards: string[];
}

// Keeps a wide pool from reintroducing the four-figure result counts
// synergy.ts's two bars exist to prevent — see docs/recommendation-coverage.md.
const MAX_COVERAGE_SUGGESTIONS = 24;

function unitIdentitySet(unit: CommanderUnit): Set<string> {
  const set = new Set<string>();
  for (const card of unit.cards) {
    for (const color of parseJsonArray(card.color_identity)) set.add(color);
  }
  return set;
}

/**
 * A bare suggestion for an owned commander with no synergy signal at all.
 * `scoreCommanders` never returns anything for a unit whose `matched` list
 * is empty — correct for the confident tier, where a commander ranked on
 * nothing is a commander ranked on nothing — but an 'owned' coverage pick is
 * worth surfacing regardless, since the card being in your list already is
 * the reason. Mirrors scoreCommanders' own identity-fit/count logic for the
 * cases it drops, rather than relaxing the gate that exists for good reason.
 */
function fallbackSuggestion(unit: CommanderUnit, owned: OwnedCard[]): CommanderSuggestion {
  const identity = unitIdentitySet(unit);
  const fitsIdentity = (entry: OwnedCard) =>
    isWithinColorIdentity(parseJsonArray(entry.row.color_identity), identity);

  let includedCardCount = 0;
  let includedDistinctCount = 0;
  for (const entry of owned) {
    if (fitsIdentity(entry)) {
      includedCardCount += entry.quantity;
      includedDistinctCount += 1;
    }
  }
  const gameChangerCards = owned
    .filter((entry) => entry.row.game_changer && fitsIdentity(entry))
    .map(toSupportingCard);

  return {
    cards: unit.cards,
    score: 0,
    matchedThemes: [],
    matchedCreatureTypes: [],
    matchedKeywords: [],
    includedCardCount,
    poolSize: includedDistinctCount,
    themeSupport: [],
    kindredSupport: [],
    keywordSupport: [],
    gameChangerCards,
    citedOracleIds: [],
  };
}

/** Scores one owned unit at the relaxed bar, falling back to a bare
 * "in your list" suggestion when it shows no signal at all. */
function tierASuggestion(
  unit: CommanderUnit,
  profile: CollectionProfile,
  owned: OwnedCard[],
  candidateSignals: Map<string, SignalMatch[]>,
): CommanderSuggestion {
  const [scored] = scoreCommanders([unit], profile, owned, candidateSignals, { minSignalCount: 1 });
  return scored ?? fallbackSuggestion(unit, owned);
}

/**
 * Every archetype a unit's own cards show any signal for, regardless of role
 * or qualifier — a coarse net cast wide on purpose so a card only considers
 * units sharing one of its own archetypes instead of rescanning the whole
 * unit pool. The real containment/active-role check happens per card in
 * `shortlistFor`, and `scoreCommanders` re-verifies `supporterMatches` when
 * it actually scores, so precision here would be wasted work.
 */
function buildArchetypeIndex(
  units: CommanderUnit[],
  candidateSignals: Map<string, SignalMatch[]>,
): Map<string, CommanderUnit[]> {
  const index = new Map<string, CommanderUnit[]>();
  for (const unit of units) {
    const archetypes = new Set<string>();
    for (const card of unit.cards) {
      for (const signal of candidateSignals.get(card.oracle_id) ?? []) {
        archetypes.add(signal.archetype);
      }
    }
    for (const archetype of archetypes) {
      const bucket = index.get(archetype);
      if (bucket) bucket.push(unit);
      else index.set(archetype, [unit]);
    }
  }
  return index;
}

/** Whether any card in the unit shows an active-role signal that would
 * accept this owned card's own signal for the same archetype — the same
 * containment relation `ownSignalContains` already names, applied here to
 * the unit's signals against the card's, rather than the usual direction. */
function unitSharesActiveSignal(
  unit: CommanderUnit,
  ownSignals: SignalMatch[],
  candidateSignals: Map<string, SignalMatch[]>,
): boolean {
  return unit.cards.some((card) =>
    (candidateSignals.get(card.oracle_id) ?? []).some(
      (unitSignal) =>
        hasActiveRole(unitSignal.roles) &&
        ownSignals.some((own) => ownSignalContains([unitSignal], own.archetype, own.qualifier)),
    ),
  );
}

/** Candidate units worth actually scoring for one still-uncovered card:
 * legal to play it, and sharing at least one active signal with it. */
function shortlistFor(
  card: CardRow,
  ownSignals: SignalMatch[],
  archetypeIndex: Map<string, CommanderUnit[]>,
  candidateSignals: Map<string, SignalMatch[]>,
): CommanderUnit[] {
  const cardIdentity = parseJsonArray(card.color_identity);
  const seen = new Set<string>();
  const shortlist: CommanderUnit[] = [];
  for (const own of ownSignals) {
    for (const unit of archetypeIndex.get(own.archetype) ?? []) {
      const key = unitKey(unit);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isWithinColorIdentity(cardIdentity, unitIdentitySet(unit))) continue;
      if (!unitSharesActiveSignal(unit, ownSignals, candidateSignals)) continue;
      shortlist.push(unit);
    }
  }
  return shortlist;
}

/** Narrowest identity first, then by relaxed score — narrowness is the whole
 * point: for a mono-black card, a mono-black unit must outrank a five-colour
 * one, or the Black filter stays empty and this exercise achieves nothing. */
function rankTierB(scored: CommanderSuggestion[]): CommanderSuggestion[] {
  return [...scored].sort((a, b) => {
    const sizeDiff =
      unitIdentitySet({ cards: a.cards }).size - unitIdentitySet({ cards: b.cards }).size;
    if (sizeDiff !== 0) return sizeDiff;
    return b.score - a.score;
  });
}

export interface BuildCoverageOptions {
  /** The confident tier already selected (`selectSuggestions`'s output) —
   * its `citedOracleIds` seed the covered set, and its units are never
   * re-suggested here. */
  suggestions: CommanderSuggestion[];
  units: CommanderUnit[];
  owned: OwnedCard[];
  profile: CollectionProfile;
  candidateSignals: Map<string, SignalMatch[]>;
}

/**
 * Runs after `selectSuggestions`. Tier A is every commander you already own
 * in the submitted list (reason `'owned'`); Tier B is a relaxed, narrowest-
 * identity-first pick for whatever's still uncovered after that (reason
 * `'covers'`). Deliberately not exhaustive — deliberately out of scope, per
 * the plan, is reporting the residue that neither tier reaches.
 */
export function buildCoverage({
  suggestions,
  units,
  owned,
  profile,
  candidateSignals,
}: BuildCoverageOptions): CoverageSuggestion[] {
  const covered = new Set<string>();
  for (const suggestion of suggestions) {
    for (const id of suggestion.citedOracleIds) covered.add(id);
  }

  const addedKeys = new Set(suggestions.map((s) => unitKey({ cards: s.cards })));
  const results: CoverageSuggestion[] = [];

  // Tier A — commanders already in the list. Reusing `units` rather than
  // building solo units by hand keeps a Partner pair correct when the player
  // happens to own both halves (CR 702.124e).
  const ownedOracleIds = new Set(owned.map((entry) => entry.row.oracle_id));
  for (const unit of units) {
    if (results.length >= MAX_COVERAGE_SUGGESTIONS) break;
    if (!unit.cards.every((card) => ownedOracleIds.has(card.oracle_id))) continue;
    const key = unitKey(unit);
    if (addedKeys.has(key)) continue;
    addedKeys.add(key);

    const base = tierASuggestion(unit, profile, owned, candidateSignals);
    const coveredCards = [
      ...new Set([...unit.cards.map((card) => card.oracle_id), ...base.citedOracleIds]),
    ];
    for (const id of coveredCards) covered.add(id);
    results.push({ ...base, coverageReason: 'owned', coveredCards });
  }

  // Tier B — relaxed narrow picks for whatever Tier A didn't already rescue.
  const archetypeIndex = buildArchetypeIndex(units, candidateSignals);
  for (const entry of owned) {
    if (results.length >= MAX_COVERAGE_SUGGESTIONS) break;
    if (covered.has(entry.row.oracle_id)) continue;

    const ownSignals = profile.signalsByCard.get(entry.row.oracle_id) ?? [];
    const shortlist = shortlistFor(entry.row, ownSignals, archetypeIndex, candidateSignals);
    if (shortlist.length === 0) continue;

    const scored = scoreCommanders(shortlist, profile, owned, candidateSignals, {
      minSignalCount: 1,
    });
    if (scored.length === 0) continue;

    const best = rankTierB(scored).find((s) => !addedKeys.has(unitKey({ cards: s.cards })));
    if (!best) continue;

    addedKeys.add(unitKey({ cards: best.cards }));
    const coveredCards = [...new Set(best.citedOracleIds)];
    for (const id of coveredCards) covered.add(id);
    results.push({ ...best, coverageReason: 'covers', coveredCards });
  }

  return results;
}

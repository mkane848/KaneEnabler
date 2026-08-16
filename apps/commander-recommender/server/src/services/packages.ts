/**
 * Filling the holes the deck analysis found.
 *
 * `deckAnalysis.ts` says which part of a game plan the list cannot execute —
 * "nine death-trigger payoffs and one sacrifice outlet". This says what to add
 * to fix it, drawn from the same precomputed relationships: every card that
 * plays the missing role in that archetype, cut down to the ones that fit the
 * colors already in the list.
 *
 * What it deliberately does *not* claim: that these are the *best* cards for
 * the job. There is no play-rate or power data here — only "this card does the
 * thing you're missing, in your colors". The ranking below is a fit heuristic,
 * and it is ordered so the honest signal comes first.
 */
import type { CardRow } from '../types';
import type { Role } from './signals';
import type { DeckAnalysis, SlotSuggestion } from './deckAnalysis';
import { crossArchetypeSlot, lifecycleFor } from './lifecycle';
import { signalKey, type SignalCandidate, type SignalKey } from './signals';

/**
 * How many suggestions to compute per short slot.
 *
 * The client reveals five at a time, so this is the load-more ceiling rather
 * than what's shown. Bounded because it ships in the recommendation response:
 * a slot has thousands of eligible cards, and the tail of an unranked list is
 * not worth the payload.
 */
export const MAX_SUGGESTIONS_PER_SLOT = 15;

/**
 * How many themes get suggestions.
 *
 * The summary reports more than this, but a list's fifth-strongest theme is
 * usually incidental, and offering to build it out is noise.
 */
const THEMES_WITH_SUGGESTIONS = 3;

/** Reads a color identity column, tolerating a malformed value. */
function colorsOf(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Every color the submitted list already plays. */
export function collectionColors(rows: CardRow[]): Set<string> {
  const colors = new Set<string>();
  for (const row of rows) for (const color of colorsOf(row.color_identity)) colors.add(color);
  return colors;
}

function fitsColors(row: CardRow, allowed: Set<string>): boolean {
  return colorsOf(row.color_identity).every((color) => allowed.has(color));
}

export interface SuggestionContext {
  /** Candidates by `signalKey`, from `findCardsBySignals`. */
  candidatesByKey: Map<string, SignalCandidate[]>;
  /** Cards already in the list, which must never be suggested back. */
  ownedOracleIds: Set<string>;
  /** Color identity the list can support without adding a color. */
  allowedColors: Set<string>;
}

/**
 * The archetypes a suggestion pass needs loaded.
 *
 * Every reported theme (so overlap can be measured against all of them), plus
 * the source archetype of any cross-archetype slot — Reanimator's
 * graveyard-filling is answered by Self-Mill cards, which the list may not
 * have a theme in at all.
 */
export function requiredSignalKeys(analysis: DeckAnalysis): SignalKey[] {
  const keys = new Map<string, SignalKey>();
  const add = (key: SignalKey) => keys.set(signalKey(key), key);

  for (const theme of analysis.themes) {
    add({ archetype: theme.archetype, qualifier: theme.qualifier });
    for (const slot of theme.slots) {
      const cross = crossArchetypeSlot(theme.archetype, slot.key);
      if (cross) add({ archetype: cross.archetype });
    }
  }
  return [...keys.values()];
}

/**
 * Ranks a slot's candidates.
 *
 * In order, and the order is the point:
 *
 *   1. **Cross-theme fit** — a card that also feeds another theme in the list
 *      is doing two jobs. This is the only criterion here derived from the
 *      user's actual list, so it leads.
 *   2. **Roles within this archetype** — a card that both makes fodder and
 *      sacrifices it beats one that only does the latter.
 *   3. **Mana value** — a proxy for playability, not for quality. It is a
 *      tiebreaker precisely because it is the weakest of the three.
 *   4. Name, so the order is stable between identical requests.
 */
function rank(a: SlotSuggestion, b: SlotSuggestion, roleCount: Map<string, number>): number {
  if (a.alsoFits.length !== b.alsoFits.length) return b.alsoFits.length - a.alsoFits.length;

  const aRoles = roleCount.get(a.oracleId) ?? 0;
  const bRoles = roleCount.get(b.oracleId) ?? 0;
  if (aRoles !== bRoles) return bRoles - aRoles;

  const aValue = a.manaValue ?? Number.POSITIVE_INFINITY;
  const bValue = b.manaValue ?? Number.POSITIVE_INFINITY;
  if (aValue !== bValue) return aValue - bValue;

  return a.name.localeCompare(b.name);
}

function toSuggestion(row: CardRow, alsoFits: string[]): SlotSuggestion {
  return {
    oracleId: row.oracle_id,
    name: row.name,
    // Suggestions are cards the list does not have, so the count is always
    // the one copy a Commander deck may run.
    quantity: 1,
    typeLine: row.type_line,
    isGameChanger: !!row.game_changer,
    manaValue: row.cmc,
    manaCost: row.mana_cost,
    imageUri: row.image_uri,
    backImageUri: row.back_image_uri ?? null,
    backName: row.back_name ?? null,
    scryfallUri: row.scryfall_uri,
    alsoFits,
  };
}

/**
 * Attaches fill suggestions to every short slot in the analysis.
 *
 * Mutates nothing: returns a new analysis, so the pure `analyzeDeck` result
 * stays the pure description of what was submitted.
 */
export function attachSuggestions(
  analysis: DeckAnalysis,
  { candidatesByKey, ownedOracleIds, allowedColors }: SuggestionContext
): DeckAnalysis {
  // Which of the list's themes each card plays into, so "also fits" can be
  // answered without a second lookup per candidate.
  const themeLabelsByCard = new Map<string, string[]>();
  for (const theme of analysis.themes) {
    const candidates = candidatesByKey.get(signalKey({ archetype: theme.archetype, qualifier: theme.qualifier }));
    for (const candidate of candidates ?? []) {
      const labels = themeLabelsByCard.get(candidate.row.oracle_id);
      if (labels) labels.push(theme.label);
      else themeLabelsByCard.set(candidate.row.oracle_id, [theme.label]);
    }
  }

  const themes = analysis.themes.map((theme, themeIndex) => {
    if (themeIndex >= THEMES_WITH_SUGGESTIONS || theme.complete) return theme;

    // The roles a slot accepts are a property of the lifecycle, not of the
    // reported status — the DTO carries what the user needs to read, not the
    // machinery behind it.
    const spec = lifecycleFor(theme.archetype);

    const slots = theme.slots.map((slot) => {
      const wanted = spec?.slots.find((s) => s.key === slot.key);
      if (slot.filled || !wanted) return slot;

      const cross = crossArchetypeSlot(theme.archetype, slot.key);
      const sourceKey = cross
        ? signalKey({ archetype: cross.archetype })
        : signalKey({ archetype: theme.archetype, qualifier: theme.qualifier });
      const wantedRoles: Role[] = cross ? cross.roles : wanted.roles;

      const roleCount = new Map<string, number>();
      const suggestions: SlotSuggestion[] = [];

      for (const candidate of candidatesByKey.get(sourceKey) ?? []) {
        if (ownedOracleIds.has(candidate.row.oracle_id)) continue;
        if (!candidate.roles.some((role) => wantedRoles.includes(role))) continue;
        if (!fitsColors(candidate.row, allowedColors)) continue;

        roleCount.set(candidate.row.oracle_id, candidate.roles.length);
        // A card in the source archetype is only "also fitting" the themes
        // *other* than the one it is being suggested for.
        const alsoFits = (themeLabelsByCard.get(candidate.row.oracle_id) ?? []).filter(
          (label) => label !== theme.label
        );
        suggestions.push(toSuggestion(candidate.row, alsoFits));
      }

      suggestions.sort((a, b) => rank(a, b, roleCount));
      return { ...slot, suggestions: suggestions.slice(0, MAX_SUGGESTIONS_PER_SLOT) };
    });

    return { ...theme, slots };
  });

  return { themes };
}

/**
 * Which cards each format allows, from the snapshot's vendored data — never
 * from a hard-coded rotation.
 *
 * Standard and Expanded use TCGdex's own legality filters (its
 * meta/legals.ts, vendored into the snapshot's index.json), which TCGdex
 * maintains from pokemon.com's rotation announcements and ban list. GLC uses
 * its own pool and ban list (data/glc.json). Unlimited allows every card.
 *
 * Legality is per print: a card id, not a name. Whether an older print is
 * legal wherever a reprint is awaits the official text (official.ts
 * `reprints`); per print is the conservative reading meanwhile.
 */
import type { LegalityFilter, PtcgCard, SetInfo } from './card';
import glc from './data/glc.json';
import { isBasicEnergy } from './kinds';

export type Format = 'standard' | 'expanded' | 'glc' | 'unlimited';
export const FORMATS: readonly Format[] = ['standard', 'expanded', 'glc', 'unlimited'];

export const FORMAT_LABELS: Record<Format, string> = {
  standard: 'Standard',
  expanded: 'Expanded',
  glc: 'Gym Leader Challenge',
  unlimited: 'Unlimited',
};

/**
 * TCGdex's legals.ts writes Shining Legends as `sm35`; its set id is `sm3.5`.
 * Left alone, that Expanded ban silently matches nothing. Each fix names the
 * card it restores, and a test fails if one stops being needed.
 */
export const BAN_ID_FIXES: Readonly<Record<string, string>> = {
  'sm35-45': 'sm3.5-45', // Marshadow (Shining Legends 45/73)
};

export interface LegalityData {
  sets: readonly SetInfo[];
  legality: { standard: LegalityFilter; expanded: LegalityFilter };
}

export interface Legality {
  isLegal(card: PtcgCard, format: Format): boolean;
  /** The series a format can draw from, so a client fetches only those. */
  seriesFor(
    format: Format,
    allSeries: readonly { id: string; regulationMarks: string[] }[],
  ): string[];
}

const GLC_POOL: ReadonlySet<string> = new Set(glc.poolSeries);
const GLC_BANNED_IDS: ReadonlySet<string> = new Set(glc.banList.flatMap((b) => b.ids));
const GLC_BANNED_NAMES: ReadonlySet<string> = new Set(
  glc.banList.flatMap((b) => ('allPrintsNamed' in b && b.allPrintsNamed ? [b.allPrintsNamed] : [])),
);
const CLASSIC_SETS: ReadonlySet<string> = new Set(glc.classicCollection.setIds);
const CLASSIC_ALLOWED: ReadonlySet<string> = new Set(glc.classicCollection.allowedNames);

export function createLegality(data: LegalityData): Legality {
  const serieOf = new Map(data.sets.map((s) => [s.id, s.serieId]));

  const compile = (filter: LegalityFilter) => ({
    series: new Set(filter.includes.series),
    sets: new Set(filter.includes.sets),
    marks: new Set(filter.includes.regulationMarks),
    excludedSets: new Set(filter.excludes.sets),
    excludedCards: new Set(filter.excludes.cards.map((id) => BAN_ID_FIXES[id] ?? id)),
  });
  const standard = compile(data.legality.standard);
  const expanded = compile(data.legality.expanded);

  // TCGdex's compiler logic, per legals.ts's own header: included by series,
  // set, or regulation mark; then excluded by set or card id.
  const passes = (card: PtcgCard, f: ReturnType<typeof compile>): boolean => {
    const serie = serieOf.get(card.setId);
    const included =
      (serie !== undefined && f.series.has(serie)) ||
      f.sets.has(card.setId) ||
      (card.regulationMark !== undefined && f.marks.has(card.regulationMark));
    return included && !f.excludedSets.has(card.setId) && !f.excludedCards.has(card.id);
  };

  const inGlcPool = (card: PtcgCard): boolean => {
    const serie = serieOf.get(card.setId);
    if (serie === undefined || !GLC_POOL.has(serie)) return false;
    if (CLASSIC_SETS.has(card.setId)) return CLASSIC_ALLOWED.has(card.name);
    return !GLC_BANNED_IDS.has(card.id) && !GLC_BANNED_NAMES.has(card.name);
  };

  return {
    isLegal(card, format) {
      if (format === 'unlimited') return true;
      // official.ts `basicEnergyLegal`; GLC's FAQ (glc.json `basicEnergyFaq`) agrees.
      if (isBasicEnergy(card)) return true;
      switch (format) {
        case 'standard':
          return passes(card, standard);
        case 'expanded':
          return passes(card, expanded);
        case 'glc':
          return inGlcPool(card);
      }
    },
    seriesFor(format, allSeries) {
      const ids = allSeries.map((s) => s.id);
      switch (format) {
        case 'unlimited':
          return ids;
        case 'glc':
          return ids.filter((id) => GLC_POOL.has(id));
        case 'expanded':
          return ids.filter((id) => expanded.series.has(id));
        case 'standard':
          return allSeries
            .filter(
              (s) =>
                standard.series.has(s.id) || s.regulationMarks.some((m) => standard.marks.has(m)),
            )
            .map((s) => s.id);
      }
    },
  };
}

/**
 * The card catalog: the app's vendored TCGdex snapshot (public/data/, built
 * by scripts/build-snapshot.mjs), served as this app's own static files.
 *
 * Nothing here reaches TCGdex or anyone else — see docs/api-policy.md's
 * TCGdex section. A format loads only the series it can draw from: Standard
 * needs two of twenty, which is ~270 KB gzipped instead of the whole ~1.2 MB.
 */
import {
  createLegality,
  type Format,
  type Legality,
  type LegalityFilter,
  type PtcgCard,
  type SetInfo,
} from '@ptcg/rules';

export interface SnapshotIndex {
  source: { repo: string; commit: string; committedAt: string; attribution: string };
  cardCount: number;
  series: { id: string; name: string; cardCount: number; regulationMarks: string[] }[];
  sets: SetInfo[];
  legality: { standard: LegalityFilter; expanded: LegalityFilter };
}

export interface Catalog {
  index: SnapshotIndex;
  legality: Legality;
  /** Every card loaded for the format, legal or not — a collection can hold either. */
  cards: readonly PtcgCard[];
  byId: ReadonlyMap<string, PtcgCard>;
  /** Every loaded print of a name. */
  byName: ReadonlyMap<string, readonly PtcgCard[]>;
  sets: ReadonlyMap<string, SetInfo>;
  /** PTCG Live set codes → sets. Not unique: `30C` names two sets. */
  setsByCode: ReadonlyMap<string, readonly SetInfo[]>;
}

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path));
  if (!response.ok) throw new Error(`Couldn't load card data (${path}: ${response.status}).`);
  return (await response.json()) as T;
}

export const loadIndex = () => getJson<SnapshotIndex>('index.json');
export const loadSeries = (id: string) => getJson<PtcgCard[]>(`series/${id}.json`);

/** The series this format needs, in index order. */
export function seriesForFormat(index: SnapshotIndex, format: Format): string[] {
  return createLegality(index).seriesFor(format, index.series);
}

export function buildCatalog(index: SnapshotIndex, series: readonly PtcgCard[][]): Catalog {
  const cards = series.flat();
  const byName = new Map<string, PtcgCard[]>();
  for (const card of cards) {
    const prints = byName.get(card.name);
    if (prints) prints.push(card);
    else byName.set(card.name, [card]);
  }
  const setsByCode = new Map<string, SetInfo[]>();
  for (const set of index.sets) {
    if (!set.code) continue;
    const code = set.code.toUpperCase();
    setsByCode.set(code, [...(setsByCode.get(code) ?? []), set]);
  }
  return {
    index,
    legality: createLegality(index),
    cards,
    byId: new Map(cards.map((c) => [c.id, c])),
    byName,
    sets: new Map(index.sets.map((s) => [s.id, s])),
    setsByCode,
  };
}

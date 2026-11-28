/**
 * The real committed snapshot as a Catalog, read from disk, for engine tests
 * that should run against actual cards rather than hand-built ones.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Format, PtcgCard } from '@ptcg/rules';
import { buildCatalog, seriesForFormat, type Catalog, type SnapshotIndex } from '../data/catalog';

const DATA = path.resolve(__dirname, '../../public/data');
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(DATA, file), 'utf8')) as T;

export const testIndex = read<SnapshotIndex>('index.json');
const cache = new Map<string, Catalog>();

export function testCatalog(format: Format): Catalog {
  const hit = cache.get(format);
  if (hit) return hit;
  const series = seriesForFormat(testIndex, format).map((id) =>
    read<PtcgCard[]>(`series/${id}.json`),
  );
  const catalog = buildCatalog(testIndex, series);
  cache.set(format, catalog);
  return catalog;
}

export function realCard(catalog: Catalog, id: string): PtcgCard {
  const card = catalog.byId.get(id);
  if (!card) throw new Error(`No card ${id} in this catalog`);
  return card;
}

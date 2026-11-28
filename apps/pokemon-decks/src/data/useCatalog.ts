import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Format } from '@ptcg/rules';
import { buildCatalog, loadIndex, loadSeries, seriesForFormat, type Catalog } from './catalog';

// The snapshot only changes with a deploy, so a loaded file never goes stale
// within a visit; switching formats reuses whatever series are already loaded.
const FOREVER = { staleTime: Infinity, gcTime: Infinity } as const;

export type CatalogState =
  { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; catalog: Catalog };

export function useCatalog(format: Format): CatalogState {
  const indexQuery = useQuery({ queryKey: ['ptcg-index'], queryFn: loadIndex, ...FOREVER });
  const ids = indexQuery.data ? seriesForFormat(indexQuery.data, format) : [];
  const seriesQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['ptcg-series', id],
      queryFn: () => loadSeries(id),
      ...FOREVER,
    })),
  });

  const error = indexQuery.error ?? seriesQueries.find((q) => q.error)?.error ?? null;
  const loaded = seriesQueries.every((q) => q.data);
  const dataKey = seriesQueries.map((q) => q.dataUpdatedAt).join(',');
  const index = indexQuery.data;

  const catalog = useMemo(
    () =>
      index && loaded
        ? buildCatalog(
            index,
            seriesQueries.map((q) => q.data ?? []),
          )
        : null,
    // seriesQueries is a fresh array every render; dataKey is what changes when its data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, loaded, dataKey],
  );

  if (error) return { status: 'error', error };
  if (!catalog) return { status: 'loading' };
  return { status: 'ready', catalog };
}

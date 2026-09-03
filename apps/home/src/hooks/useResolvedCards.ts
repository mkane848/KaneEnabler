import { useQuery } from '@tanstack/react-query';
import { fetchCardsByOracleIds } from '../api/cards';

/** Card name/image/commander data for a set of oracle_ids, keyed for TanStack Query by the sorted id list. */
export function useResolvedCards(oracleIds: string[]) {
  const key = [...oracleIds].sort().join(',');
  return useQuery({
    queryKey: ['resolved-cards', key],
    queryFn: () => fetchCardsByOracleIds(oracleIds),
    enabled: oracleIds.length > 0,
    // Immutable reference data keyed by the sorted oracle_id list — a given
    // set of ids always resolves to the same cards, so there's no reason to
    // refetch on every mount. This picks up the same quiet-query defaults the
    // recommender client sets globally (see its main.tsx), scoped narrowly to
    // this query rather than app-wide: the preference queries that feed the
    // same profile page are mutable and must not share this staleTime.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

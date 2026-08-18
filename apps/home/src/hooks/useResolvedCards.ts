import { useQuery } from '@tanstack/react-query';
import { fetchCardsByOracleIds } from '../api/cards';

/** Card name/image/commander data for a set of oracle_ids, keyed for TanStack Query by the sorted id list. */
export function useResolvedCards(oracleIds: string[]) {
  const key = [...oracleIds].sort().join(',');
  return useQuery({
    queryKey: ['resolved-cards', key],
    queryFn: () => fetchCardsByOracleIds(oracleIds),
    enabled: oracleIds.length > 0,
  });
}

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from './client';
import { fromComboRow, type ComboPreferenceRow } from './rows';
import type { ComboPreference, ComboPreferenceInput } from './types';

const QUERY_KEY = 'combo-preferences';

/** All of the signed-in user's favourited/hated combos. RLS scopes the select to their own rows. */
export function useComboPreferences(userId: string | null): UseQueryResult<ComboPreference[]> {
  return useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async () => {
      // `enabled` below guarantees TanStack Query never invokes queryFn while
      // supabase is null.
      const { data, error } = await supabase!.from('combo_preferences').select('*');
      if (error) throw new Error(error.message);
      return (data as ComboPreferenceRow[]).map(fromComboRow);
    },
    enabled: supabase != null && userId != null,
  });
}

/**
 * Sets (upserts) a like/hate for a combo, storing `input.snapshot` as-is —
 * this is the only write path for `snapshot`, so a refresh click and an
 * initial favourite both go through here with a freshly-fetched snapshot.
 */
export function useSetComboPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, input }: { userId: string; input: ComboPreferenceInput }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      const { error } = await supabase.from('combo_preferences').upsert(
        {
          user_id: userId,
          combo_key: input.comboKey,
          sentiment: input.sentiment,
          spellbook_id: input.spellbookId ?? null,
          snapshot: input.snapshot,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,combo_key' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

export function useRemoveComboPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, comboKey }: { userId: string; comboKey: string }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      const { error } = await supabase
        .from('combo_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('combo_key', comboKey);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

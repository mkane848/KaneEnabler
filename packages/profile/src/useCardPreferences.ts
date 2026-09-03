import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from './client';
import { fromCardRow, type CardPreferenceRow } from './rows';
import type { CardPreference, CardPreferenceInput } from './types';

const QUERY_KEY = 'card-preferences';

/** All of the signed-in user's card preferences. RLS scopes the select to their own rows. */
export function useCardPreferences(userId: string | null): UseQueryResult<CardPreference[]> {
  return useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async () => {
      // `enabled` below guarantees TanStack Query never invokes queryFn while
      // supabase is null.
      const { data, error } = await supabase!.from('card_preferences').select('*');
      if (error) throw new Error(error.message);
      return (data as CardPreferenceRow[]).map(fromCardRow);
    },
    enabled: supabase != null && userId != null,
  });
}

/** Sets (upserts) a like/dislike, optionally with jank/other tags and a note. */
export function useSetCardPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, input }: { userId: string; input: CardPreferenceInput }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      const { error } = await supabase.from('card_preferences').upsert(
        {
          user_id: userId,
          oracle_id: input.oracleId,
          sentiment: input.sentiment,
          tags: input.tags ?? [],
          note: input.note ?? null,
        },
        { onConflict: 'user_id,oracle_id' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

/**
 * Upserts several card preferences in one request. A Partner/Background
 * pair is liked or disliked as a unit, and the single-row writer looped
 * one mutation per card — halving the round trips and making the two-card
 * write atomic here instead.
 */
export function useSetCardPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, inputs }: { userId: string; inputs: CardPreferenceInput[] }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      if (inputs.length === 0) return;
      const { error } = await supabase.from('card_preferences').upsert(
        inputs.map((input) => ({
          user_id: userId,
          oracle_id: input.oracleId,
          sentiment: input.sentiment,
          tags: input.tags ?? [],
          note: input.note ?? null,
        })),
        { onConflict: 'user_id,oracle_id' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

/** Clears a card's preference entirely (not the same as setting it to neither like nor dislike — there is no such state, so removal is the only way back to neutral). */
export function useRemoveCardPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, oracleId }: { userId: string; oracleId: string }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      const { error } = await supabase
        .from('card_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('oracle_id', oracleId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

/**
 * Clears several card preferences in one request — the batch counterpart to
 * `useSetCardPreferences`, used when a liked/disliked unit is toggled back
 * to neutral.
 */
export function useRemoveCardPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, oracleIds }: { userId: string; oracleIds: string[] }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      if (oracleIds.length === 0) return;
      const { error } = await supabase
        .from('card_preferences')
        .delete()
        .eq('user_id', userId)
        .in('oracle_id', oracleIds);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });
}

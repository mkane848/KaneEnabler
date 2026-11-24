import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from './client';
import { fromCardRow, type CardPreferenceRow } from './rows';
import type { CardPreference, CardPreferenceInput } from './types';

const QUERY_KEY = 'card-preferences';

function cacheKey(userId: string): [string, string] {
  return [QUERY_KEY, userId];
}

interface UpsertOneVars {
  userId: string;
  input: CardPreferenceInput;
}
interface UpsertManyVars {
  userId: string;
  inputs: CardPreferenceInput[];
}
interface RemoveOneVars {
  userId: string;
  oracleId: string;
}
interface RemoveManyVars {
  userId: string;
  oracleIds: string[];
}
interface OptimisticContext {
  previous: CardPreference[] | undefined;
}

/**
 * Applies an optimistic upsert to the cached preferences list so a tap flips
 * the button immediately instead of waiting for the request + refetch. A row
 * that already exists keeps its server identity; a brand-new one gets a
 * temporary id that the post-write invalidation replaces.
 */
function withPreferences(
  current: CardPreference[] | undefined,
  userId: string,
  inputs: CardPreferenceInput[],
): CardPreference[] {
  const byOracleId = new Map((current ?? []).map((preference) => [preference.oracleId, preference]));
  for (const input of inputs) {
    const existing = byOracleId.get(input.oracleId);
    byOracleId.set(input.oracleId, {
      id: existing?.id ?? `optimistic:${input.oracleId}`,
      userId,
      oracleId: input.oracleId,
      sentiment: input.sentiment,
      tags: input.tags ?? existing?.tags ?? [],
      note: input.note ?? existing?.note ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  }
  return [...byOracleId.values()];
}

function withoutPreferences(
  current: CardPreference[] | undefined,
  oracleIds: string[],
): CardPreference[] {
  const removing = new Set(oracleIds);
  return (current ?? []).filter((preference) => !removing.has(preference.oracleId));
}

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

/**
 * Optimistic mutations (docs/state-machine-audit.md D7): the cache is patched
 * in `onMutate`, rolled back in `onError`, and reconciled by a refetch in
 * `onSettled`. Without this, the active button came only from the server
 * cache, so a fast second tap re-sent the same sentiment and a quick
 * like→dislike raced two writes.
 */

/** Sets (upserts) a like/dislike, optionally with jank/other tags and a note. */
export function useSetCardPreference() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpsertOneVars, OptimisticContext>({
    mutationFn: async ({ userId, input }) => {
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
    onMutate: async ({ userId, input }) => {
      const key = cacheKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardPreference[]>(key);
      queryClient.setQueryData<CardPreference[]>(key, (current) =>
        withPreferences(current, userId, [input]),
      );
      return { previous };
    },
    onError: (_error, { userId }, context) => {
      queryClient.setQueryData(cacheKey(userId), context?.previous);
    },
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: cacheKey(userId) });
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
  return useMutation<void, Error, UpsertManyVars, OptimisticContext>({
    mutationFn: async ({ userId, inputs }) => {
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
    onMutate: async ({ userId, inputs }) => {
      const key = cacheKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardPreference[]>(key);
      queryClient.setQueryData<CardPreference[]>(key, (current) =>
        withPreferences(current, userId, inputs),
      );
      return { previous };
    },
    onError: (_error, { userId }, context) => {
      queryClient.setQueryData(cacheKey(userId), context?.previous);
    },
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: cacheKey(userId) });
    },
  });
}

/** Clears a card's preference entirely (not the same as setting it to neither like nor dislike — there is no such state, so removal is the only way back to neutral). */
export function useRemoveCardPreference() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RemoveOneVars, OptimisticContext>({
    mutationFn: async ({ userId, oracleId }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      const { error } = await supabase
        .from('card_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('oracle_id', oracleId);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ userId, oracleId }) => {
      const key = cacheKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardPreference[]>(key);
      queryClient.setQueryData<CardPreference[]>(key, (current) =>
        withoutPreferences(current, [oracleId]),
      );
      return { previous };
    },
    onError: (_error, { userId }, context) => {
      queryClient.setQueryData(cacheKey(userId), context?.previous);
    },
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: cacheKey(userId) });
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
  return useMutation<void, Error, RemoveManyVars, OptimisticContext>({
    mutationFn: async ({ userId, oracleIds }) => {
      if (!supabase) throw new Error('Profiles are not configured for this deployment.');
      if (oracleIds.length === 0) return;
      const { error } = await supabase
        .from('card_preferences')
        .delete()
        .eq('user_id', userId)
        .in('oracle_id', oracleIds);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ userId, oracleIds }) => {
      const key = cacheKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardPreference[]>(key);
      queryClient.setQueryData<CardPreference[]>(key, (current) =>
        withoutPreferences(current, oracleIds),
      );
      return { previous };
    },
    onError: (_error, { userId }, context) => {
      queryClient.setQueryData(cacheKey(userId), context?.previous);
    },
    onSettled: (_data, _error, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: cacheKey(userId) });
    },
  });
}

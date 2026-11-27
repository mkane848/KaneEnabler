/**
 * The second, shared layer of the Commander Spellbook cache: a Supabase
 * table (supabase/migrations/*_spellbook_cache.sql), so an answer survives a
 * restart and serves every user, not just the process that asked.
 *
 * It only ever saves Spellbook a call; it never adds one. With no Supabase
 * config (local dev, CI, tests) there is no store and lookups behave exactly
 * as they did with the in-memory cache alone. A store error is logged and
 * treated as a miss — it must never be why a combo lookup fails.
 */
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface StoredLookup<T> {
  value: T;
  fetchedAt: number;
}

export interface SpellbookStore<T = unknown> {
  get(key: string): Promise<StoredLookup<T> | null>;
  put(key: string, value: T): Promise<void>;
}

const TABLE = 'spellbook_cache';

/**
 * The stored key: a hash of the server's cache key, which is the sorted
 * commander and card names — fixed-length, and no decklist in the table.
 */
export function storeKey(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex');
}

export function createSupabaseStore<T>(client: SupabaseClient, ttlMs: number): SpellbookStore<T> {
  return {
    async get(key) {
      const { data, error } = await client
        .from(TABLE)
        .select('value, fetched_at')
        .eq('key', storeKey(key))
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { value: data.value as T, fetchedAt: Date.parse(data.fetched_at as string) };
    },
    async put(key, value) {
      const now = Date.now();
      const { error } = await client
        .from(TABLE)
        .upsert({ key: storeKey(key), value, fetched_at: new Date(now).toISOString() });
      if (error) throw error;
      // Pruning on write keeps the table bounded by the hour's traffic without
      // a scheduled job.
      const { error: pruneError } = await client
        .from(TABLE)
        .delete()
        .lt('fetched_at', new Date(now - ttlMs).toISOString());
      if (pruneError) throw pruneError;
    },
  };
}

/**
 * The store for this deploy, or null when Supabase isn't configured. The
 * service-role key is a Render secret (render.yaml `sync: false`), never
 * shipped to a browser.
 */
export function storeFromEnv<T>(ttlMs: number, env = process.env): SpellbookStore<T> | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createSupabaseStore<T>(client, ttlMs);
}

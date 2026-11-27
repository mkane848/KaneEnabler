import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseStore, storeFromEnv, storeKey } from './spellbookStore';

describe('storeKey', () => {
  it('hashes the cache key, so no decklist is stored in the clear', () => {
    const key = storeKey('[["krenko, mob boss"],["sol ring"]]');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('krenko');
    expect(storeKey('[["krenko, mob boss"],["sol ring"]]')).toBe(key);
  });
});

describe('storeFromEnv', () => {
  it('is null without Supabase config, so local dev and CI behave as before', () => {
    expect(storeFromEnv(1000, {})).toBeNull();
    expect(storeFromEnv(1000, { SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
  });

  it('builds a store when both the URL and the service-role key are set', () => {
    const store = storeFromEnv(1000, {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });
    expect(store).not.toBeNull();
  });
});

/** Records the query-builder calls a store makes, answering with `result`. */
function fakeClient(result: { data?: unknown; error?: unknown } = {}) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'eq', 'upsert', 'delete', 'lt']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  // Awaiting the builder (upsert/delete chains) resolves to the result.
  (builder as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => void) =>
    resolve({ error: result.error ?? null })) as never;
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return { client, calls };
}

describe('createSupabaseStore', () => {
  it('reads one row by hashed key and returns its value and age', async () => {
    const { client, calls } = fakeClient({
      data: { value: { ready: [], almost: [] }, fetched_at: '2026-11-27T12:00:00.000Z' },
    });
    const got = await createSupabaseStore(client, 1000).get('k');
    expect(got).toEqual({
      value: { ready: [], almost: [] },
      fetchedAt: Date.parse('2026-11-27T12:00:00.000Z'),
    });
    expect(calls).toContainEqual(['eq', 'key', storeKey('k')]);
  });

  it('returns null for a missing row and throws on an error', async () => {
    expect(await createSupabaseStore(fakeClient().client, 1000).get('k')).toBeNull();
    await expect(
      createSupabaseStore(fakeClient({ error: new Error('boom') }).client, 1000).get('k'),
    ).rejects.toThrow('boom');
  });

  it('upserts by hashed key, then prunes rows older than the TTL', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseStore(client, 60_000).put('k', { ready: [], almost: [] });
    const upsert = calls.find(([m]) => m === 'upsert');
    expect(upsert?.[1]).toMatchObject({ key: storeKey('k'), value: { ready: [], almost: [] } });
    expect(calls.some(([m]) => m === 'delete')).toBe(true);
    expect(calls.find(([m]) => m === 'lt')?.[1]).toBe('fetched_at');
  });

  it('throws when the write fails', async () => {
    const { client } = fakeClient({ error: new Error('denied') });
    await expect(createSupabaseStore(client, 1000).put('k', {})).rejects.toThrow('denied');
  });
});

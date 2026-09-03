import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const select = vi.fn();
const upsert = vi.fn();
const deleteEq1 = vi.fn();
const deleteEq2 = vi.fn();
const deleteIn = vi.fn();
const from = vi.fn();

vi.mock('./client', () => ({ supabase: null }));

import * as clientModule from './client';
import {
  useCardPreferences,
  useRemoveCardPreference,
  useRemoveCardPreferences,
  useSetCardPreference,
  useSetCardPreferences,
} from './useCardPreferences';
import type { CardPreferenceRow } from './rows';

const FAKE_SUPABASE = { from } as unknown as NonNullable<(typeof clientModule)['supabase']>;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  from.mockReset();
  select.mockReset();
  upsert.mockReset();
  deleteEq1.mockReset();
  deleteEq2.mockReset();
  deleteIn.mockReset();
  vi.mocked(clientModule).supabase = FAKE_SUPABASE;

  // .from(table).select(...) — awaited directly.
  // .from(table).upsert(obj, opts) — awaited directly.
  // .from(table).delete().eq(a, b).eq(c, d) — awaited after the second .eq().
  from.mockImplementation(() => ({
    select,
    upsert,
    delete: () => ({ eq: deleteEq1 }),
  }));
  deleteEq1.mockImplementation(() => ({ eq: deleteEq2, in: deleteIn }));
});

const ROW: CardPreferenceRow = {
  id: 'row-1',
  user_id: 'user-1',
  oracle_id: 'oracle-1',
  sentiment: 'like',
  tags: ['jank'],
  note: 'silly card',
  created_at: '2026-01-01T00:00:00Z',
};

describe('useCardPreferences', () => {
  it('does not query when signed out (userId null)', () => {
    renderHook(() => useCardPreferences(null), { wrapper });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not query when Supabase is not configured', () => {
    vi.mocked(clientModule).supabase = null;
    renderHook(() => useCardPreferences('user-1'), { wrapper });
    expect(from).not.toHaveBeenCalled();
  });

  it('fetches and maps rows to camelCase on success', async () => {
    select.mockResolvedValue({ data: [ROW], error: null });
    const { result } = renderHook(() => useCardPreferences('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('card_preferences');
    expect(select).toHaveBeenCalledWith('*');
    expect(result.current.data).toEqual([
      {
        id: 'row-1',
        userId: 'user-1',
        oracleId: 'oracle-1',
        sentiment: 'like',
        tags: ['jank'],
        note: 'silly card',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('surfaces a Supabase error as a query error', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'row-level security violation' } });
    const { result } = renderHook(() => useCardPreferences('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('row-level security violation');
  });
});

describe('useSetCardPreference', () => {
  it('upserts with the user id, oracle id, sentiment, and defaulted tags/note', async () => {
    upsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSetCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', input: { oracleId: 'oracle-1', sentiment: 'like' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('card_preferences');
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        oracle_id: 'oracle-1',
        sentiment: 'like',
        tags: [],
        note: null,
      },
      { onConflict: 'user_id,oracle_id' },
    );
  });

  it('passes through explicit tags and note when given', async () => {
    upsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSetCardPreference(), { wrapper });

    result.current.mutate({
      userId: 'user-1',
      input: { oracleId: 'oracle-1', sentiment: 'dislike', tags: ['jank'], note: 'too cute' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['jank'], note: 'too cute' }),
      expect.anything(),
    );
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useSetCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', input: { oracleId: 'oracle-1', sentiment: 'like' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects with the Supabase error message on failure', async () => {
    upsert.mockResolvedValue({ error: { message: 'unique constraint violated' } });
    const { result } = renderHook(() => useSetCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', input: { oracleId: 'oracle-1', sentiment: 'like' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('unique constraint violated');
  });
});

describe('useRemoveCardPreference', () => {
  it('deletes by user id and oracle id', async () => {
    deleteEq2.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useRemoveCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', oracleId: 'oracle-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('card_preferences');
    expect(deleteEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteEq2).toHaveBeenCalledWith('oracle_id', 'oracle-1');
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useRemoveCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', oracleId: 'oracle-1' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
  });

  it('deletes one card via .eq for the single-row path', async () => {
    deleteEq2.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useRemoveCardPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', oracleId: 'oracle-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteEq2).toHaveBeenCalledWith('oracle_id', 'oracle-1');
  });
});

describe('useSetCardPreferences', () => {
  it('upserts several cards as a single array in one request', async () => {
    upsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSetCardPreferences(), { wrapper });

    result.current.mutate({
      userId: 'user-1',
      inputs: [
        { oracleId: 'a', sentiment: 'like' },
        { oracleId: 'b', sentiment: 'like' },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('card_preferences');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      [
        { user_id: 'user-1', oracle_id: 'a', sentiment: 'like', tags: [], note: null },
        { user_id: 'user-1', oracle_id: 'b', sentiment: 'like', tags: [], note: null },
      ],
      { onConflict: 'user_id,oracle_id' },
    );
  });

  it('is a no-op for an empty input list', async () => {
    const { result } = renderHook(() => useSetCardPreferences(), { wrapper });
    result.current.mutate({ userId: 'user-1', inputs: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).not.toHaveBeenCalled();
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useSetCardPreferences(), { wrapper });
    result.current.mutate({ userId: 'user-1', inputs: [{ oracleId: 'a', sentiment: 'like' }] });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
  });
});

describe('useRemoveCardPreferences', () => {
  it('deletes several cards in one request via .in(oracle_id, ids)', async () => {
    deleteIn.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useRemoveCardPreferences(), { wrapper });

    result.current.mutate({ userId: 'user-1', oracleIds: ['a', 'b'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('card_preferences');
    expect(deleteEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteIn).toHaveBeenCalledWith('oracle_id', ['a', 'b']);
  });

  it('is a no-op for an empty id list', async () => {
    const { result } = renderHook(() => useRemoveCardPreferences(), { wrapper });
    result.current.mutate({ userId: 'user-1', oracleIds: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).not.toHaveBeenCalled();
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useRemoveCardPreferences(), { wrapper });
    result.current.mutate({ userId: 'user-1', oracleIds: ['a'] });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
  });
});

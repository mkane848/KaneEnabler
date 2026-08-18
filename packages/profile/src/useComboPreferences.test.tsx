import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const select = vi.fn();
const upsert = vi.fn();
const deleteEq1 = vi.fn();
const deleteEq2 = vi.fn();
const from = vi.fn();

vi.mock('./client', () => ({ supabase: null }));

import * as clientModule from './client';
import {
  useComboPreferences,
  useRemoveComboPreference,
  useSetComboPreference,
} from './useComboPreferences';
import type { ComboPreferenceRow } from './rows';

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
  vi.mocked(clientModule).supabase = FAKE_SUPABASE;

  from.mockImplementation(() => ({
    select,
    upsert,
    delete: () => ({ eq: deleteEq1 }),
  }));
  deleteEq1.mockImplementation(() => ({ eq: deleteEq2 }));
});

const ROW: ComboPreferenceRow = {
  id: 'row-1',
  user_id: 'user-1',
  combo_key: 'combo-key-1',
  sentiment: 'like',
  spellbook_id: 'spellbook-1',
  snapshot: { cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'] },
  fetched_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

describe('useComboPreferences', () => {
  it('does not query when signed out (userId null)', () => {
    renderHook(() => useComboPreferences(null), { wrapper });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not query when Supabase is not configured', () => {
    vi.mocked(clientModule).supabase = null;
    renderHook(() => useComboPreferences('user-1'), { wrapper });
    expect(from).not.toHaveBeenCalled();
  });

  it('fetches and maps rows to camelCase on success, snapshot included as-is', async () => {
    select.mockResolvedValue({ data: [ROW], error: null });
    const { result } = renderHook(() => useComboPreferences('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('combo_preferences');
    expect(result.current.data).toEqual([
      {
        id: 'row-1',
        userId: 'user-1',
        comboKey: 'combo-key-1',
        sentiment: 'like',
        spellbookId: 'spellbook-1',
        snapshot: { cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'] },
        fetchedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('surfaces a Supabase error as a query error', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'row-level security violation' } });
    const { result } = renderHook(() => useComboPreferences('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('row-level security violation');
  });
});

describe('useSetComboPreference', () => {
  it('upserts the snapshot as-is, with a fresh fetched_at and defaulted spellbook_id', async () => {
    upsert.mockResolvedValue({ error: null });
    const before = Date.now();
    const { result } = renderHook(() => useSetComboPreference(), { wrapper });

    result.current.mutate({
      userId: 'user-1',
      input: { comboKey: 'combo-key-1', sentiment: 'like', snapshot: { cards: ['A', 'B'] } },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('combo_preferences');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsert.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload).toMatchObject({
      user_id: 'user-1',
      combo_key: 'combo-key-1',
      sentiment: 'like',
      spellbook_id: null,
      snapshot: { cards: ['A', 'B'] },
    });
    expect(new Date(payload.fetched_at as string).getTime()).toBeGreaterThanOrEqual(before);
    expect(opts).toEqual({ onConflict: 'user_id,combo_key' });
  });

  it('passes through an explicit spellbookId when given', async () => {
    upsert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSetComboPreference(), { wrapper });

    result.current.mutate({
      userId: 'user-1',
      input: {
        comboKey: 'combo-key-1',
        sentiment: 'like',
        snapshot: {},
        spellbookId: 'spellbook-9',
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ spellbook_id: 'spellbook-9' }),
      expect.anything(),
    );
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useSetComboPreference(), { wrapper });

    result.current.mutate({
      userId: 'user-1',
      input: { comboKey: 'combo-key-1', sentiment: 'like', snapshot: {} },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('useRemoveComboPreference', () => {
  it('deletes by user id and combo key', async () => {
    deleteEq2.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useRemoveComboPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', comboKey: 'combo-key-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('combo_preferences');
    expect(deleteEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteEq2).toHaveBeenCalledWith('combo_key', 'combo-key-1');
  });

  it('throws when Supabase is not configured', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useRemoveComboPreference(), { wrapper });

    result.current.mutate({ userId: 'user-1', comboKey: 'combo-key-1' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profiles are not configured for this deployment.');
  });
});

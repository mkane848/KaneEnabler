import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const useAuth = vi.fn();
const useCardPreferences = vi.fn();
const useComboPreferences = vi.fn();

vi.mock('./useAuth', () => ({
  useAuth: () => useAuth(),
}));
vi.mock('./useCardPreferences', () => ({
  useCardPreferences: (userId: string | null) => useCardPreferences(userId),
}));
vi.mock('./useComboPreferences', () => ({
  useComboPreferences: (userId: string | null) => useComboPreferences(userId),
}));

import {
  PreferencesProvider,
  useCardPreferencesIndex,
  useComboPreferencesIndex,
} from './usePreferencesIndex';
import type { CardPreference, ComboPreference } from './types';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
}

const CARD: CardPreference = {
  id: 'card-1',
  userId: 'user-1',
  oracleId: 'oracle-1',
  sentiment: 'like',
  tags: [],
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const COMBO: ComboPreference = {
  id: 'combo-1',
  userId: 'user-1',
  comboKey: 'key-1',
  sentiment: 'like',
  spellbookId: null,
  snapshot: { permalink: null, cards: [], produces: [], description: null },
  fetchedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'user-1' } });
  useCardPreferences.mockReturnValue({ data: [CARD] });
  useComboPreferences.mockReturnValue({ data: [COMBO] });
});

describe('PreferencesProvider + index hooks', () => {
  it('builds a Map keyed by oracle_id for card preferences', async () => {
    const { result } = renderHook(() => useCardPreferencesIndex(), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('oracle-1')).toEqual(CARD);
  });

  it('builds a Map keyed by combo_key for combo preferences', async () => {
    const { result } = renderHook(() => useComboPreferencesIndex(), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('key-1')).toEqual(COMBO);
  });

  it('returns empty maps when no preferences exist', async () => {
    useCardPreferences.mockReturnValue({ data: undefined });
    useComboPreferences.mockReturnValue({ data: undefined });
    const card = renderHook(() => useCardPreferencesIndex(), { wrapper });
    const combo = renderHook(() => useComboPreferencesIndex(), { wrapper });
    expect(card.result.current.size).toBe(0);
    expect(combo.result.current.size).toBe(0);
  });
});

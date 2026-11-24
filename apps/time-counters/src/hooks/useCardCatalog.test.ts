import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardData } from '../types';

const loadCatalog = vi.fn();

vi.mock('../utils/cardCatalog', () => ({
  loadCatalog: () => loadCatalog(),
}));

import { useCardCatalog } from './useCardCatalog';

const CARDS: CardData[] = [{ id: 'a', name: 'A' }];

beforeEach(() => {
  loadCatalog.mockReset();
});

describe('useCardCatalog', () => {
  it('loads the catalog and reports it as not loading', async () => {
    loadCatalog.mockResolvedValue(CARDS);
    const { result } = renderHook(() => useCardCatalog());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.cards).toEqual(CARDS));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('surfaces a load error', async () => {
    loadCatalog.mockRejectedValue(new Error('HTTP 500'));
    const { result } = renderHook(() => useCardCatalog());

    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));
    expect(result.current.cards).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('retry clears the error, re-runs the load, and can recover', async () => {
    loadCatalog.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce(CARDS);
    const { result } = renderHook(() => useCardCatalog());
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));

    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.cards).toEqual(CARDS));
    expect(result.current.error).toBeNull();
    expect(loadCatalog).toHaveBeenCalledTimes(2);
  });
});

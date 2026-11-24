import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { ComboFinder } from './ComboFinder';

const fetchCombos = vi.fn(async () => ({
  ready: [],
  almost: [],
  cached: false,
  searchedCardCount: 0,
}));

vi.mock('../api/client', async (orig) => ({
  ...(await orig<object>()),
  fetchCombos: (...args: unknown[]) => fetchCombos(...(args as [])),
}));

function renderFinder() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ComboFinder commanderNames={['Krenko, Mob Boss']} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchCombos.mockClear();
  useAppStore.setState({ submittedList: 'Sol Ring' });
});

describe('ComboFinder — click consent is tied to the submitted list (B6)', () => {
  it('does not fetch for a changed list without a fresh click, and offers the button again', async () => {
    renderFinder();
    fireEvent.click(screen.getByRole('button', { name: 'Find combos' }));
    await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(1));

    act(() => useAppStore.setState({ submittedList: 'Sol Ring\nArcane Signet' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Find combos' })).toBeInTheDocument(),
    );
    expect(fetchCombos).toHaveBeenCalledTimes(1);
  });

  it('a fresh click on the new list fetches once for that list', async () => {
    renderFinder();
    fireEvent.click(screen.getByRole('button', { name: 'Find combos' }));
    await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(1));

    act(() => useAppStore.setState({ submittedList: 'Sol Ring\nArcane Signet' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Find combos' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find combos' }));
    await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(2));
    expect(fetchCombos).toHaveBeenLastCalledWith('Sol Ring\nArcane Signet', ['Krenko, Mob Boss']);
  });
});

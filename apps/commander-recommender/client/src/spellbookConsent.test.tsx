/**
 * Regression guard for docs/api-policy.md: Commander Spellbook is never asked
 * anything because a page or route loaded — only because someone clicked
 * "Find combos".
 *
 * ComboFinder.test.tsx pins the click-consent rules on the component alone.
 * This renders the whole app through the real router instead, with a list
 * already submitted, results on screen, and search params in the URL, because
 * the regression this guards against looks like a refactor: a combos query
 * hoisted into a route loader, an effect that "prefetches for snappiness", a
 * query left `enabled` by default. None of those would touch ComboFinder.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, PreferencesProvider } from '@mtg/profile';
import { router } from './router';
import { useAppStore } from './store/useAppStore';
import {
  makeCommanderCard,
  makeKindredSupport,
  makeSuggestion,
  makeSupportingCard,
} from './test/fixtures';
import type { RecommendResponse } from './types';

const RESPONSE: RecommendResponse = {
  totalParsed: 1,
  totalMatched: 1,
  ignoredCopies: 0,
  notFound: [],
  banned: [],
  weakMatchesOnly: false,
  deck: { themes: [] },
  suggestions: [
    makeSuggestion({
      cards: [makeCommanderCard({ name: 'Krenko, Mob Boss', oracleId: 'krenko' })],
      // A reason to explain is what puts the "Why this commander?" panel,
      // and the ComboFinder inside it, on the card.
      kindredSupport: [
        makeKindredSupport({ cards: [makeSupportingCard({ name: 'Goblin Instigator' })] }),
      ],
    }),
  ],
  alsoPlayable: [],
};

const fetchCombos = vi.fn(async () => ({
  ready: [],
  almost: [],
  cached: false,
  searchedCardCount: 0,
}));

vi.mock('./api/client', async (orig) => ({
  ...(await orig<object>()),
  wakeServer: () => {},
  fetchMeta: async () => ({}),
  fetchRecommendations: async () => RESPONSE,
  fetchCombos: (...args: unknown[]) => fetchCombos(...(args as [])),
}));

// jsdom has no layout, so the real window virtualizer measures a 0px window
// and renders no rows. Rendering every row is the honest stand-in here: this
// test is about which requests fire, not which rows are on screen.
vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: 0 })),
    getTotalSize: () => 0,
    measureElement: () => {},
    options: { scrollMargin: 0 },
  }),
}));

/** Anything that slips past the module mock above still goes through here. */
const rawFetch = vi.fn(async () => new Response('{}', { status: 200 }));

function renderApp(url: string) {
  window.history.pushState({}, '', url);
  // Same quiet defaults as main.tsx, minus nothing: a test that loosened them
  // would prove less than production does.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PreferencesProvider>
          <RouterProvider router={router} />
        </PreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function spellbookRequests(): unknown[] {
  return rawFetch.mock.calls.filter((call: unknown[]) => /combos|spellbook/i.test(String(call[0])));
}

beforeEach(() => {
  fetchCombos.mockClear();
  rawFetch.mockClear();
  vi.stubGlobal('fetch', rawFetch);
  // jsdom has no layout; the results grid's column probe only needs the
  // constructor to exist.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useAppStore.setState({ rawList: 'Krenko, Mob Boss', submittedList: 'Krenko, Mob Boss' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAppStore.getState().resetList();
});

describe('API policy: Spellbook is click-only', () => {
  it.each([
    ['a bare visit', '/'],
    ['a visit with filters and sort in the URL', '/?sortMode=name&sortDirection=asc'],
  ])('makes no combo request on %s, even with results and an open panel', async (_, url) => {
    renderApp(url);
    await screen.findByText('1 of 1 cards matched');

    // Opening the explanation panel is where ComboFinder mounts; reading it
    // is still not asking.
    fireEvent.click(await screen.findByRole('button', { name: 'Why this commander?' }));
    await screen.findByRole('button', { name: 'Find combos' });
    await act(async () => {
      await router.invalidate();
    });

    expect(fetchCombos).not.toHaveBeenCalled();
    expect(spellbookRequests()).toEqual([]);
  });

  it('asks exactly once, after the click', async () => {
    renderApp('/');
    await screen.findByText('1 of 1 cards matched');
    fireEvent.click(await screen.findByRole('button', { name: 'Why this commander?' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Find combos' }));

    await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(1));
    expect(fetchCombos).toHaveBeenCalledWith('Krenko, Mob Boss', ['Krenko, Mob Boss']);
  });
});

/**
 * The whole app through its real router, with fetch serving the committed
 * snapshot from disk — so these exercise the same data path as production.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from './router';

const DATA = path.resolve(__dirname, '../public/data');
const requested: string[] = [];

function serveSnapshot(input: RequestInfo | URL) {
  const url = String(input);
  requested.push(url);
  const rel = url.replace(/^.*\/data\//, '');
  try {
    return Promise.resolve(
      new Response(readFileSync(path.join(DATA, rel), 'utf8'), { status: 200 }),
    );
  } catch {
    return Promise.resolve(new Response('not found', { status: 404 }));
  }
}

async function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // The router is a module singleton: navigating it once it's mounted is what
  // makes a later test start on a different route.
  await act(() => router.navigate({ href: url }));
  return view;
}

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal('fetch', vi.fn(serveSnapshot));
});
afterEach(() => vi.unstubAllGlobals());

describe('collection → decks', () => {
  it('reads a pasted list and ranks the deck it was built for first', async () => {
    await renderAt('/?format=standard');
    const box = await screen.findByLabelText('Your cards');
    fireEvent.change(box, {
      target: { value: '3 Gastly POR 48\n2 Haunter\n2 Gengar ex TEF 104\n3 Not A Real Card' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Find decks' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Find decks' }));

    const first = (await screen.findAllByRole('article'))[0]!; // findAll throws if there are none
    expect(within(first).getByRole('heading', { level: 3 })).toHaveTextContent('Gengar ex');
    expect(screen.getByText(/1 line not recognised/)).toBeInTheDocument();
    expect(localStorage.getItem('pokemon-decks:collection:v1')).toMatch(/Gastly/);
  });

  it('fetches only the series the format needs, and only from its own data folder', async () => {
    await renderAt('/?format=standard');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Find decks' })).toBeEnabled());
    expect(requested.map((u) => u.replace(/^.*\/data\//, '')).sort()).toEqual([
      'index.json',
      'series/me.json',
      'series/sv.json',
    ]);
    expect(requested.every((u) => u.startsWith('/data/'))).toBe(true);
  });
});

describe('build around a Pokémon', () => {
  it('builds a legal Gym Leader Challenge list from a searched attacker', async () => {
    await renderAt('/build?format=glc');
    const input = await screen.findByLabelText('Main attacker');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'feraligatr' } });
    const options = await screen.findAllByRole('button', { name: /Feraligatr/ });
    fireEvent.click(options[0]!); // findAll throws if there are none

    const deck = await screen.findByRole('article');
    expect(within(deck).getByRole('heading', { level: 3 })).toHaveTextContent('Feraligatr');
    expect(deck.querySelector('.deck-violations')).toBeNull();
  });

  it('says when nothing by that name can attack in the format', async () => {
    await renderAt('/build?format=standard');
    const input = await screen.findByLabelText('Main attacker');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(await screen.findByText('No attacker by that name in this format.')).toBeInTheDocument();
  });
});

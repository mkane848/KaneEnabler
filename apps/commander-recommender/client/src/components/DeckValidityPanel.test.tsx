import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import type { DeckValidityResponse } from '../types';
import { DeckValidityPanel } from './DeckValidityPanel';

const fetchDeckValidity = vi.fn(async () => legalVerdict());

vi.mock('../api/client', async (orig) => ({
  ...(await orig<object>()),
  fetchDeckValidity: (...args: unknown[]) => fetchDeckValidity(...(args as [])),
}));

function legalVerdict(): DeckValidityResponse {
  return {
    isValid: true,
    commander: {
      names: ["Atraxa, Praetors' Voice"],
      colorIdentity: ['W', 'U', 'B', 'G'],
      eligible: true,
      pairingLegal: true,
      missingFromList: [],
    },
    deckSize: { total: 100, expected: 100, isValid: true },
    colorIdentity: { combined: ['W', 'U', 'B', 'G'], violations: [] },
    singleton: { violations: [] },
    legality: { banned: [], notFound: [] },
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeckValidityPanel />
    </QueryClientProvider>,
  );
}

function expandAndFill(commander = "Atraxa, Praetors' Voice") {
  fireEvent.click(screen.getByRole('button', { name: /Check a finished deck/i }));
  fireEvent.change(screen.getByLabelText('Commander'), { target: { value: commander } });
}

beforeEach(() => {
  fetchDeckValidity.mockClear();
  fetchDeckValidity.mockImplementation(async () => legalVerdict());
  useAppStore.setState({
    rawList: "1 Atraxa, Praetors' Voice\n99 Swamp",
    submittedList: '',
    submittedValidation: null,
  });
});

describe('DeckValidityPanel', () => {
  it('checks the current list with the named commander and renders a legal verdict', async () => {
    renderPanel();
    expandAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Check deck' }));

    await waitFor(() => expect(fetchDeckValidity).toHaveBeenCalledTimes(1));
    expect(fetchDeckValidity).toHaveBeenCalledWith("1 Atraxa, Praetors' Voice\n99 Swamp", [
      "Atraxa, Praetors' Voice",
    ]);
    expect(await screen.findByText('This deck is legal.')).toBeInTheDocument();
  });

  it('reports each failing check with the cards responsible', async () => {
    fetchDeckValidity.mockImplementation(async () => ({
      ...legalVerdict(),
      isValid: false,
      deckSize: { total: 100, expected: 100, isValid: true },
      commander: {
        ...legalVerdict().commander,
        missingFromList: ["Atraxa, Praetors' Voice"],
      },
      singleton: { violations: [{ name: 'Sol Ring', quantity: 2, limit: 1 }] },
    }));

    renderPanel();
    expandAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Check deck' }));

    expect(await screen.findByText("This deck isn't legal yet.")).toBeInTheDocument();
    expect(screen.getByText(/Not in the pasted list: Atraxa/)).toBeInTheDocument();
    expect(screen.getByText('Sol Ring: 2 copies, limit 1')).toBeInTheDocument();
    // Passing checks stay visible too — the verdict is the whole picture.
    expect(screen.getByText(/Deck size — 100 of 100 cards/)).toBeInTheDocument();
  });

  it('refuses to check an empty list, without fetching', () => {
    useAppStore.setState({ rawList: '   ' });
    renderPanel();
    expandAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Check deck' }));

    expect(screen.getByText(/Paste or upload the full deck list first/)).toBeInTheDocument();
    expect(fetchDeckValidity).not.toHaveBeenCalled();
  });

  it('refuses to check without a named commander, without fetching', () => {
    renderPanel();
    expandAndFill('');
    fireEvent.click(screen.getByRole('button', { name: 'Check deck' }));

    expect(screen.getByText(/Name the deck's commander/)).toBeInTheDocument();
    expect(fetchDeckValidity).not.toHaveBeenCalled();
  });

  it('clearing the list retires the verdict', async () => {
    renderPanel();
    expandAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Check deck' }));
    expect(await screen.findByText('This deck is legal.')).toBeInTheDocument();

    // What CardListUpload's Clear does — the verdict hangs off the submitted
    // snapshot, so resetting it is what retires the check.
    useAppStore.getState().resetList();
    await waitFor(() => expect(screen.queryByText('This deck is legal.')).not.toBeInTheDocument());
  });
});

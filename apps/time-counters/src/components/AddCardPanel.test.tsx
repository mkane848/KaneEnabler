import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddCardPanel from './AddCardPanel';
import styles from './AddCardPanel.module.css';
import type { AddCardInput } from '../hooks/useGameState';
import type { CardData } from '../types';

// Synthetic fixtures, not real card text — just enough to exercise
// detectMechanic's Suspend/Vanishing regexes (see counters.ts).
const SUSPEND_CARD: CardData = {
  id: 'suspend-1',
  name: 'Test Suspend Card',
  colorIdentity: ['R'],
  typeLine: 'Instant',
  oracleText:
    'Suspend 3—{2}{R} (Rather than cast this spell from your hand, you may pay {2}{R} and exile it with three time counters on it instead. At the beginning of your upkeep, remove a time counter. When the last is removed, cast it without paying its mana cost.)',
};
const VANISHING_CARD: CardData = {
  id: 'vanishing-1',
  name: 'Test Vanishing Creature',
  colorIdentity: ['U'],
  typeLine: 'Creature — Illusion',
  oracleText:
    'Flying\nVanishing 2 (This creature enters the battlefield with two time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)',
};
const CATALOG: CardData[] = [SUSPEND_CARD, VANISHING_CARD];

// CSS Modules are typed via an index signature, so TS can't see that this
// key is always present — it's a class AddCardPanel.tsx itself references
// by the same import, so it necessarily exists in the co-located .css file.
const MECHANIC_BTN_ACTIVE = styles.mechanicBtnActive!;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(CATALOG), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openSearch() {
  fireEvent.click(screen.getByText('Add a card'));
}

function searchFor(query: string) {
  fireEvent.change(screen.getByPlaceholderText(/Search any Jeskai card|Loading card catalog/), {
    target: { value: query },
  });
}

function isActive(element: HTMLElement): boolean {
  return element.className.split(' ').includes(MECHANIC_BTN_ACTIVE);
}

describe('AddCardPanel', () => {
  it('selecting a Suspend card auto-detects the mechanic, direction, and starting count', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));

    expect(await screen.findByText('Set up counters')).toBeInTheDocument();
    expect(isActive(screen.getByRole('button', { name: 'Suspend' }))).toBe(true);
    expect(screen.getByText('Detected Suspend 3 from card text.')).toBeInTheDocument();
    expect(screen.getByLabelText('Starting counters')).toHaveValue(3);
  });

  it('selecting a Vanishing card auto-detects it the same way', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Vanishing');
    fireEvent.click(await screen.findByText('Test Vanishing Creature'));

    await screen.findByText('Set up counters');
    expect(isActive(screen.getByRole('button', { name: 'Vanishing' }))).toBe(true);
    expect(screen.getByText('Detected Vanishing 2 from card text.')).toBeInTheDocument();
  });

  it('switching mechanic away from the detected one keeps the detected count, since it is still relevant', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(isActive(screen.getByRole('button', { name: 'Custom' }))).toBe(true);
    // detectedCount (3) is still truthy, so switching mechanics doesn't
    // reset startingCount back to blank — see AddCardPanel's changeMechanic.
    expect(screen.getByLabelText('Starting counters')).toHaveValue(3);
    // Custom's own fields appear.
    expect(screen.getByLabelText('Counter name')).toBeInTheDocument();
    expect(screen.getByText('Counts down')).toBeInTheDocument();
  });

  it('Saga: starts with 3 empty chapter rows, disables submit until every row has text', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');

    fireEvent.click(screen.getByRole('button', { name: 'Saga' }));
    const chapterInputs = screen.getAllByPlaceholderText(/Chapter .+ — what happens/);
    expect(chapterInputs).toHaveLength(3);

    const submit = screen.getByRole('button', { name: 'Add to tracker' });
    expect(submit).toBeDisabled();

    fireEvent.change(chapterInputs[0]!, { target: { value: 'Exile the top card.' } });
    fireEvent.change(chapterInputs[1]!, { target: { value: 'Draw a card.' } });
    expect(submit).toBeDisabled();

    fireEvent.change(chapterInputs[2]!, { target: { value: 'Sacrifice this Saga.' } });
    expect(submit).not.toBeDisabled();
  });

  it('Saga: removing a chapter row leaves the rest intact and submit still enabled', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');
    fireEvent.click(screen.getByRole('button', { name: 'Saga' }));

    let chapterInputs = screen.getAllByPlaceholderText(/Chapter .+ — what happens/);
    chapterInputs.forEach((input, i) => fireEvent.change(input, { target: { value: `Ch ${i}` } }));

    fireEvent.click(screen.getAllByRole('button', { name: /Remove chapter/ })[1]!);
    chapterInputs = screen.getAllByPlaceholderText(/Chapter .+ — what happens/);
    expect(chapterInputs).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add to tracker' })).not.toBeDisabled();
  });

  it('submits a Saga with the right payload: increment direction, targetCount from chapter count', async () => {
    const onAdd = vi.fn<(input: AddCardInput) => void>();
    render(<AddCardPanel onAdd={onAdd} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');
    fireEvent.click(screen.getByRole('button', { name: 'Saga' }));

    const chapterInputs = screen.getAllByPlaceholderText(/Chapter .+ — what happens/);
    fireEvent.change(chapterInputs[0]!, { target: { value: 'Chapter one.' } });
    fireEvent.change(chapterInputs[1]!, { target: { value: 'Chapter two.' } });
    fireEvent.change(chapterInputs[2]!, { target: { value: 'Chapter three.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to tracker' }));

    // form.handleSubmit() is async even with no validators — the callback
    // that calls onAdd hasn't necessarily run by the time fireEvent returns.
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          card: SUSPEND_CARD,
          mechanic: 'saga',
          direction: 'increment',
          targetCount: 3,
          chapters: ['Chapter one.', 'Chapter two.', 'Chapter three.'],
        }),
      ),
    );
  });

  it('submits a non-Saga card with the detected mechanic and starting count', async () => {
    const onAdd = vi.fn<(input: AddCardInput) => void>();
    render(<AddCardPanel onAdd={onAdd} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');

    fireEvent.click(screen.getByRole('button', { name: 'Add to tracker' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          card: SUSPEND_CARD,
          mechanic: 'suspend',
          direction: 'decrement',
          startingCount: 3,
          autoAdjust: true,
        }),
      ),
    );
    // resetAll() runs after a successful submit — back to the closed stage.
    expect(screen.queryByText('Set up counters')).not.toBeInTheDocument();
    expect(screen.getByText('Add a card')).toBeInTheDocument();
  });

  it('manual entry defaults to Custom with no detected-count hint', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    fireEvent.click(screen.getByText('Add it by name'));
    fireEvent.change(screen.getByLabelText('Card name'), {
      target: { value: 'Made-Up Test Card' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Set up counters');
    expect(isActive(screen.getByRole('button', { name: 'Custom' }))).toBe(true);
    expect(screen.queryByText(/^Detected /)).not.toBeInTheDocument();
  });

  it('the quick-suspend flow forces Suspend and pre-fills the suspended-by-effect note', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    fireEvent.click(screen.getByText('Suspend a card via an effect (e.g. The Tenth Doctor) →'));
    searchFor('Test Vanishing');
    // Even a Vanishing card's own text is overridden — quickSuspend forces Suspend regardless.
    fireEvent.click(await screen.findByText('Test Vanishing Creature'));

    await screen.findByText('Set up counters');
    expect(isActive(screen.getByRole('button', { name: 'Suspend' }))).toBe(true);
    const resolveNote = screen.getByLabelText('What happens at 0') as HTMLTextAreaElement;
    expect(resolveNote.value).toContain('Suspended by an effect');
  });

  it('Cancel resets back to a clean search stage, discarding the in-progress selection', async () => {
    render(<AddCardPanel onAdd={vi.fn()} />);
    openSearch();
    searchFor('Test Suspend');
    fireEvent.click(await screen.findByText('Test Suspend Card'));
    await screen.findByText('Set up counters');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Set up counters')).not.toBeInTheDocument();
    expect(screen.getByText('Add a card')).toBeInTheDocument();

    openSearch();
    expect(screen.getByPlaceholderText(/Search any Jeskai card|Loading card catalog/)).toHaveValue(
      '',
    );
  });
});

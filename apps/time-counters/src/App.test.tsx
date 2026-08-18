import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the main chrome without crashing', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Time Counters' })).toBeInTheDocument();
    expect(screen.getByText('Next turn →')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /turn 1/i })).toBeInTheDocument();
  });

  it('advancing the turn updates the header', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Time Counters' });
    fireEvent.click(screen.getByText('Next turn →'));
    expect(screen.getByRole('button', { name: /turn 2/i })).toBeInTheDocument();
  });

  it('casting a commander from the command zone shows it as a card on the field', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Time Counters' });

    fireEvent.click(screen.getByRole('button', { name: 'The Tenth Doctor' }));
    fireEvent.click(screen.getByText('Cast The Tenth Doctor from the command zone'));
    fireEvent.click(screen.getByText('Done'));

    expect(
      screen.getByRole('button', { name: /The Tenth Doctor, on the battlefield/i }),
    ).toBeInTheDocument();
  });
});

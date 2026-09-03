import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComboFavoriteButton } from './ComboFavoriteButton';
import type { ComboDTO } from '../types';

const useAuth = vi.fn();
const useComboPreferencesIndex = vi.fn();
const setMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('@mtg/profile', () => ({
  comboKey: (cards: string[]) => [...cards].sort().join('|'),
  useAuth: () => useAuth(),
  useComboPreferencesIndex: () => useComboPreferencesIndex(),
  useSetComboPreference: () => ({ mutate: setMutate }),
  useRemoveComboPreference: () => ({ mutate: removeMutate }),
}));

const USER = { id: 'user-1' };
const COMBO: ComboDTO = {
  id: 'spellbook-1',
  permalink: 'https://commanderspellbook.com/combo/abc',
  cards: ['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'],
  produces: ['Infinite combat damage'],
  description: 'Copy Zealous Conscripts, untap Kiki-Jiki, repeat.',
  missing: [],
};

/**
 * docs/api-policy.md's "Regression guards" and docs/handoff.md Phase 7 both
 * require a favourited combo to render from its stored snapshot, never a
 * live Commander Spellbook call — this is the one component that reads a
 * combo preference back (ComboFinder itself only fetches live results after
 * an explicit click; there's no separate favourites-browsing page yet). The
 * network is stubbed to reject any request so a hidden live call would fail
 * the test loudly instead of silently succeeding.
 */
describe('ComboFavoriteButton — renders from stored snapshot, network blocked', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setMutate.mockClear();
    removeMutate.mockClear();
    useAuth.mockReturnValue({ user: USER });
    useComboPreferencesIndex.mockReturnValue(new Map());
    global.fetch = vi.fn(() => {
      throw new Error(
        'network access attempted — favourite rendering must use the stored snapshot',
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the favourited (liked) state from a stored preference alone', () => {
    useComboPreferencesIndex.mockReturnValue(
      new Map([
        [
          'Kiki-Jiki, Mirror Breaker|Zealous Conscripts',
          { comboKey: 'Kiki-Jiki, Mirror Breaker|Zealous Conscripts', sentiment: 'like' },
        ],
      ]),
    );

    render(<ComboFavoriteButton combo={COMBO} />);

    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toHaveClass('is-liked');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows neither state when the combo has no stored preference yet', () => {
    useComboPreferencesIndex.mockReturnValue(new Map());

    render(<ComboFavoriteButton combo={COMBO} />);

    expect(screen.getByRole('button', { name: 'Favourite this combo' })).not.toHaveClass(
      'is-liked',
    );
    expect(screen.getByRole('button', { name: 'Mark as a combo you hate' })).not.toHaveClass(
      'is-disliked',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing when signed out, still without touching the network', () => {
    useAuth.mockReturnValue({ user: null });
    useComboPreferencesIndex.mockReturnValue(new Map());

    const { container } = render(<ComboFavoriteButton combo={COMBO} />);

    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

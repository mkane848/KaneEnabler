import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardPreference, ComboPreference } from '@mtg/profile';
import Profile from './Profile';
import type { ResolvedCard } from '../api/cards';

const useAuth = vi.fn();
const useCardPreferences = vi.fn();
const useComboPreferences = vi.fn();
const useResolvedCards = vi.fn();
const setCardPreference = vi.fn();
const removeCardPreference = vi.fn();
const removeComboPreference = vi.fn();

vi.mock('@mtg/profile', () => ({
  useAuth: () => useAuth(),
  useCardPreferences: () => useCardPreferences(),
  useComboPreferences: () => useComboPreferences(),
  useSetCardPreference: () => ({ mutate: setCardPreference }),
  useRemoveCardPreference: () => ({ mutate: removeCardPreference }),
  useRemoveComboPreference: () => ({ mutate: removeComboPreference }),
  AuthDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <h2>Sign in</h2>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('../hooks/useResolvedCards', () => ({
  useResolvedCards: () => useResolvedCards(),
}));

const CARD_PREFERENCE: CardPreference = {
  id: 'pref-1',
  userId: 'user-1',
  oracleId: 'oracle-sol-ring',
  sentiment: 'like',
  tags: [],
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const RESOLVED_CARD: ResolvedCard = {
  oracleId: 'oracle-sol-ring',
  name: 'Sol Ring',
  imageUri: 'https://example.com/sol-ring.jpg',
  backImageUri: null,
  backName: null,
  typeLine: 'Artifact',
  scryfallUri: null,
  isCommanderEligible: false,
};

const COMBO_PREFERENCE: ComboPreference = {
  id: 'combo-1',
  userId: 'user-1',
  comboKey: 'key-1',
  sentiment: 'like',
  spellbookId: null,
  snapshot: {
    cards: ['Thassa', 'Consuming Aberration'],
    produces: ['Infinite mill'],
    description: 'Mill your opponents out.',
    permalink: 'https://commanderspellbook.com/combo/abc',
  },
  fetchedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useCardPreferences.mockReturnValue({ data: [] });
  useComboPreferences.mockReturnValue({ data: [] });
  useResolvedCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
});

describe('Profile', () => {
  it('shows a message when profiles are not configured for this deployment', () => {
    useAuth.mockReturnValue({ user: null, loading: false, configured: false });
    render(<Profile />);
    expect(screen.getByText(/configured for this deployment/i)).toBeInTheDocument();
  });

  it('renders nothing while the initial session check is in flight', () => {
    useAuth.mockReturnValue({ user: null, loading: true, configured: true });
    const { container } = render(<Profile />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts to sign in when signed out, and opens the auth dialog', () => {
    useAuth.mockReturnValue({ user: null, loading: false, configured: true });
    render(<Profile />);
    expect(screen.getByText(/sign in to see the cards/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in →' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows empty states for every section when signed in with no preferences', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    render(<Profile />);

    expect(screen.getByText(/like a card in the recommender/i)).toBeInTheDocument();
    expect(screen.getByText('Nothing disliked yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing favourited yet.')).toBeInTheDocument();
    expect(screen.getByText('None marked yet.')).toBeInTheDocument();
  });

  it('renders a liked card with its resolved name and a remove control', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useCardPreferences.mockReturnValue({ data: [CARD_PREFERENCE] });
    useResolvedCards.mockReturnValue({
      data: [RESOLVED_CARD],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<Profile />);
    expect(screen.getByText('Sol Ring')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeCardPreference).toHaveBeenCalledWith({
      userId: 'user-1',
      oracleId: 'oracle-sol-ring',
    });
  });

  it('toggles the jank tag while preserving the note', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useCardPreferences.mockReturnValue({
      data: [{ ...CARD_PREFERENCE, note: 'Draws a lot of removal' }],
    });
    useResolvedCards.mockReturnValue({
      data: [RESOLVED_CARD],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<Profile />);
    fireEvent.click(screen.getByRole('button', { name: /mark as favourite jank card/i }));

    expect(setCardPreference).toHaveBeenCalledWith({
      userId: 'user-1',
      input: {
        oracleId: 'oracle-sol-ring',
        sentiment: 'like',
        tags: ['jank'],
        note: 'Draws a lot of removal',
      },
    });
  });

  it('saves an edited note on blur', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useCardPreferences.mockReturnValue({ data: [CARD_PREFERENCE] });
    useResolvedCards.mockReturnValue({
      data: [RESOLVED_CARD],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<Profile />);
    const note = screen.getByLabelText('Note for Sol Ring');
    fireEvent.change(note, { target: { value: 'Auto-include in every deck' } });
    fireEvent.blur(note);

    expect(setCardPreference).toHaveBeenCalledWith({
      userId: 'user-1',
      input: {
        oracleId: 'oracle-sol-ring',
        sentiment: 'like',
        tags: [],
        note: 'Auto-include in every deck',
      },
    });
  });

  it('marks a commander-eligible liked card with a badge', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useCardPreferences.mockReturnValue({ data: [CARD_PREFERENCE] });
    useResolvedCards.mockReturnValue({
      data: [{ ...RESOLVED_CARD, isCommanderEligible: true }],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<Profile />);
    expect(screen.getByText('Commander')).toBeInTheDocument();
  });

  it('renders a favourited combo from its stored snapshot', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useComboPreferences.mockReturnValue({ data: [COMBO_PREFERENCE] });

    render(<Profile />);
    expect(screen.getByText('Thassa + Consuming Aberration')).toBeInTheDocument();
    expect(screen.getByText('Infinite mill')).toBeInTheDocument();
    expect(screen.getByText('Mill your opponents out.')).toBeInTheDocument();
  });

  it('surfaces a card-lookup error', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false, configured: true });
    useCardPreferences.mockReturnValue({ data: [CARD_PREFERENCE] });
    useResolvedCards.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Could not reach the server.'),
    });

    render(<Profile />);
    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument();
  });
});

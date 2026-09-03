import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LikeDislikeButtons } from './LikeDislikeButtons';

const useAuth = vi.fn();
const useCardPreferencesIndex = vi.fn();
const setPreferencesMutate = vi.fn();
const removePreferencesMutate = vi.fn();

vi.mock('@mtg/profile', () => ({
  useAuth: () => useAuth(),
  useCardPreferencesIndex: () => useCardPreferencesIndex(),
  useSetCardPreferences: () => ({ mutate: setPreferencesMutate }),
  useRemoveCardPreferences: () => ({ mutate: removePreferencesMutate }),
}));

const USER = { id: 'user-1' };

beforeEach(() => {
  setPreferencesMutate.mockClear();
  removePreferencesMutate.mockClear();
  useAuth.mockReturnValue({ user: USER });
  useCardPreferencesIndex.mockReturnValue(new Map());
});

function indexFrom(rows: { oracleId: string; sentiment: string }[]) {
  return new Map(rows.map((r) => [r.oracleId, r]));
}

describe('LikeDislikeButtons', () => {
  it('renders nothing when signed out', () => {
    useAuth.mockReturnValue({ user: null });
    const { container } = render(<LikeDislikeButtons oracleIds={['card-1']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders neither button active when the card has no preference yet', () => {
    render(<LikeDislikeButtons oracleIds={['card-1']} />);
    expect(screen.getByRole('button', { name: 'Like this commander' })).not.toHaveClass('is-liked');
    expect(screen.getByRole('button', { name: 'Dislike this commander' })).not.toHaveClass(
      'is-disliked',
    );
  });

  it('shows the like button active when the card is already liked', () => {
    useCardPreferencesIndex.mockReturnValue(indexFrom([{ oracleId: 'card-1', sentiment: 'like' }]));
    render(<LikeDislikeButtons oracleIds={['card-1']} />);
    expect(screen.getByRole('button', { name: 'Remove like' })).toHaveClass('is-liked');
  });

  it('clicking Like on an unliked card sets a like preference for every card in the unit', () => {
    render(<LikeDislikeButtons oracleIds={['a', 'b']} />);
    screen.getByRole('button', { name: 'Like this commander' }).click();

    expect(setPreferencesMutate).toHaveBeenCalledTimes(1);
    expect(setPreferencesMutate).toHaveBeenCalledWith({
      userId: 'user-1',
      inputs: [
        { oracleId: 'a', sentiment: 'like' },
        { oracleId: 'b', sentiment: 'like' },
      ],
    });
    expect(removePreferencesMutate).not.toHaveBeenCalled();
  });

  it('clicking an already-active sentiment clears it instead of re-setting it', () => {
    useCardPreferencesIndex.mockReturnValue(indexFrom([{ oracleId: 'a', sentiment: 'like' }]));
    render(<LikeDislikeButtons oracleIds={['a']} />);
    screen.getByRole('button', { name: 'Remove like' }).click();

    expect(removePreferencesMutate).toHaveBeenCalledWith({ userId: 'user-1', oracleIds: ['a'] });
    expect(setPreferencesMutate).not.toHaveBeenCalled();
  });

  it('a Partner pair split between like and dislike shows neither button as active', () => {
    useCardPreferencesIndex.mockReturnValue(
      indexFrom([
        { oracleId: 'a', sentiment: 'like' },
        { oracleId: 'b', sentiment: 'dislike' },
      ]),
    );
    render(<LikeDislikeButtons oracleIds={['a', 'b']} />);
    expect(screen.getByRole('button', { name: 'Like this commander' })).not.toHaveClass('is-liked');
    expect(screen.getByRole('button', { name: 'Dislike this commander' })).not.toHaveClass(
      'is-disliked',
    );
  });
});

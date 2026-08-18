import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LikeDislikeButtons } from './LikeDislikeButtons';

const useAuth = vi.fn();
const useCardPreferences = vi.fn();
const setMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('@mtg/profile', () => ({
  useAuth: () => useAuth(),
  useCardPreferences: (userId: string | null) => useCardPreferences(userId),
  useSetCardPreference: () => ({ mutate: setMutate }),
  useRemoveCardPreference: () => ({ mutate: removeMutate }),
}));

const USER = { id: 'user-1' };

beforeEach(() => {
  setMutate.mockClear();
  removeMutate.mockClear();
  useAuth.mockReturnValue({ user: USER });
  useCardPreferences.mockReturnValue({ data: [] });
});

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
    useCardPreferences.mockReturnValue({
      data: [{ oracleId: 'card-1', sentiment: 'like', tags: [], note: null }],
    });
    render(<LikeDislikeButtons oracleIds={['card-1']} />);
    expect(screen.getByRole('button', { name: 'Remove like' })).toHaveClass('is-liked');
  });

  it('clicking Like on an unliked card sets a like preference for every card in the unit', () => {
    render(<LikeDislikeButtons oracleIds={['a', 'b']} />);
    screen.getByRole('button', { name: 'Like this commander' }).click();

    expect(setMutate).toHaveBeenCalledTimes(2);
    expect(setMutate).toHaveBeenCalledWith({
      userId: 'user-1',
      input: { oracleId: 'a', sentiment: 'like' },
    });
    expect(setMutate).toHaveBeenCalledWith({
      userId: 'user-1',
      input: { oracleId: 'b', sentiment: 'like' },
    });
    expect(removeMutate).not.toHaveBeenCalled();
  });

  it('clicking an already-active sentiment clears it instead of re-setting it', () => {
    useCardPreferences.mockReturnValue({
      data: [{ oracleId: 'a', sentiment: 'like', tags: [], note: null }],
    });
    render(<LikeDislikeButtons oracleIds={['a']} />);
    screen.getByRole('button', { name: 'Remove like' }).click();

    expect(removeMutate).toHaveBeenCalledWith({ userId: 'user-1', oracleId: 'a' });
    expect(setMutate).not.toHaveBeenCalled();
  });

  it('a Partner pair split between like and dislike shows neither button as active', () => {
    useCardPreferences.mockReturnValue({
      data: [
        { oracleId: 'a', sentiment: 'like', tags: [], note: null },
        { oracleId: 'b', sentiment: 'dislike', tags: [], note: null },
      ],
    });
    render(<LikeDislikeButtons oracleIds={['a', 'b']} />);
    expect(screen.getByRole('button', { name: 'Like this commander' })).not.toHaveClass('is-liked');
    expect(screen.getByRole('button', { name: 'Dislike this commander' })).not.toHaveClass(
      'is-disliked',
    );
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';

const useAuth = vi.fn();
const signOut = vi.fn();

vi.mock('@mtg/profile', () => ({
  useAuth: () => useAuth(),
}));

beforeEach(() => {
  signOut.mockClear();
});

describe('AccountMenu', () => {
  it('renders nothing when Supabase is not configured for this deployment', () => {
    useAuth.mockReturnValue({ user: null, loading: false, configured: false, signOut });
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the initial session check is in flight', () => {
    useAuth.mockReturnValue({ user: null, loading: true, configured: true, signOut });
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a Sign in trigger when signed out', () => {
    useAuth.mockReturnValue({ user: null, loading: false, configured: true, signOut });
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('clicking Sign in opens the auth dialog', () => {
    useAuth.mockReturnValue({ user: null, loading: false, configured: true, signOut });
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the account email and a Sign out button when signed in', () => {
    useAuth.mockReturnValue({
      user: { email: 'player@example.com' },
      loading: false,
      configured: true,
      signOut,
    });
    render(<AccountMenu />);
    expect(screen.getByText('player@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

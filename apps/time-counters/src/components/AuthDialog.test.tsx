import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthDialog } from './AuthDialog';

const signIn = vi.fn();
const signUp = vi.fn();

vi.mock('@mtg/profile', () => ({
  useAuth: () => ({ signIn: (...args: unknown[]) => signIn(...args), signUp: (...args: unknown[]) => signUp(...args) }),
}));

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  signIn.mockClear();
  signUp.mockClear();
});

describe('AuthDialog', () => {
  it('submits sign-in credentials and closes on success', async () => {
    signIn.mockResolvedValue({ error: null });
    const onClose = vi.fn();
    render(<AuthDialog onClose={onClose} />);

    fillAndSubmit('player@example.com', 'hunter2');

    expect(signIn).toHaveBeenCalledWith('player@example.com', 'hunter2');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('shows the error message and stays open when sign-in fails', async () => {
    signIn.mockResolvedValue({ error: 'Invalid login credentials' });
    render(<AuthDialog onClose={vi.fn()} />);

    fillAndSubmit('player@example.com', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('switching to sign-up mode submits via signUp and shows the confirmation note', async () => {
    signUp.mockResolvedValue({ error: null });
    render(<AuthDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(signUp).toHaveBeenCalledWith('new@example.com', 'hunter2');
    expect(
      await screen.findByText(/Check new@example\.com for a confirmation link/),
    ).toBeInTheDocument();
  });
});

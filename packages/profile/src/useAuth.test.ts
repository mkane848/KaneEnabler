import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signUp = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const unsubscribe = vi.fn();

// Mocked per-test via vi.mocked(supabaseModule).supabase — see beforeEach.
// useAuth reads `supabase` at call time (not module-load time), so
// reassigning the mocked export between tests works the same way a real
// deployment toggling VITE_SUPABASE_URL on/off would.
vi.mock('./client', () => ({ supabase: null }));

import * as clientModule from './client';
import { useAuth } from './useAuth';

const FAKE_SUPABASE = {
  auth: { getSession, onAuthStateChange, signUp, signInWithPassword, signOut },
} as unknown as NonNullable<(typeof clientModule)['supabase']>;

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe } } });
  signUp.mockReset();
  signInWithPassword.mockReset();
  signOut.mockReset();
  unsubscribe.mockReset();
});

describe('useAuth — not configured', () => {
  it('reports configured: false and never calls Supabase', () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useAuth());
    expect(result.current.configured).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('signIn/signUp resolve with a "not configured" error instead of throwing', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useAuth());
    await expect(result.current.signIn('a@b.com', 'pw')).resolves.toEqual({
      error: 'Profiles are not configured for this deployment.',
    });
    await expect(result.current.signUp('a@b.com', 'pw')).resolves.toEqual({
      error: 'Profiles are not configured for this deployment.',
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('signOut is a silent no-op', async () => {
    vi.mocked(clientModule).supabase = null;
    const { result } = renderHook(() => useAuth());
    await expect(result.current.signOut()).resolves.toBeUndefined();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('useAuth — configured', () => {
  const USER = { id: 'user-1', email: 'a@b.com' };

  beforeEach(() => {
    vi.mocked(clientModule).supabase = FAKE_SUPABASE;
  });

  it('starts loading, then resolves the initial session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: USER } } });
    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(USER);
    expect(result.current.configured).toBe(true);
  });

  it('has no session initially when none exists', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('stops loading (rather than hanging forever) when the initial session check rejects', async () => {
    // getSession() normally resolves { data, error } rather than rejecting,
    // but a rejected fetch (network failure, CSP block) is possible — every
    // consumer gates its render on `loading`, so a missing .catch here would
    // hide the sign-in UI forever instead of degrading to signed-out.
    getSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('updates the user when onAuthStateChange fires', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    let authCallback: (event: string, session: { user: typeof USER } | null) => void = () => {};
    onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();

    act(() => {
      authCallback('SIGNED_IN', { user: USER });
    });
    expect(result.current.user).toEqual(USER);

    act(() => {
      authCallback('SIGNED_OUT', null);
    });
    expect(result.current.user).toBeNull();
  });

  it('unsubscribes on unmount', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { unmount, result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('signIn calls signInWithPassword and reports no error on success', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth());
    const outcome = await result.current.signIn('a@b.com', 'hunter2');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'hunter2' });
    expect(outcome).toEqual({ error: null });
  });

  it('signIn surfaces a Supabase error message', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const { result } = renderHook(() => useAuth());
    const outcome = await result.current.signIn('a@b.com', 'wrong');
    expect(outcome).toEqual({ error: 'Invalid login credentials' });
  });

  it('signUp calls supabase.auth.signUp with the confirmation redirect', async () => {
    signUp.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth());
    const outcome = await result.current.signUp('new@b.com', 'hunter2');
    expect(signUp).toHaveBeenCalledWith({
      email: 'new@b.com',
      password: 'hunter2',
      options: { emailRedirectTo: window.location.origin },
    });
    expect(outcome).toEqual({ error: null });
  });

  it('signOut calls supabase.auth.signOut', async () => {
    signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth());
    await result.current.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

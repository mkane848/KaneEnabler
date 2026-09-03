import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './client';

const NOT_CONFIGURED = 'Profiles are not configured for this deployment.';

export interface AuthResult {
  error: string | null;
}

export interface AuthState {
  user: User | null;
  /** True only while the initial session check is in flight, on mount. */
  loading: boolean;
  /** False when VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY aren't set. */
  configured: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const NOT_CONFIGURED_STATE: AuthState = {
  user: null,
  loading: false,
  configured: false,
  signUp: async () => ({ error: NOT_CONFIGURED }),
  signIn: async () => ({ error: NOT_CONFIGURED }),
  signOut: async () => {},
};

const AuthContext = createContext<AuthState>(NOT_CONFIGURED_STATE);

/**
 * One `getSession` + one `onAuthStateChange` subscription for the whole app,
 * regardless of how many components read it. `useAuth` pulls from this
 * context rather than each caller running its own Supabase session — a
 * virtualized results grid renders one button per row, and N independent
 * subscriptions all agreeing with each other is pure waste.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabase != null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        // getSession() normally resolves rather than rejects, but if the
        // underlying fetch itself throws (network failure, CSP block), a
        // missing .catch here would leave loading stuck true forever — every
        // consumer (AccountMenu, the /profile route) gates its render on it,
        // so this degrades to "no session" instead of an eternal spinner.
        if (cancelled) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { error: NOT_CONFIGURED };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }

  async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { error: NOT_CONFIGURED };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, configured: supabase != null, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Reads the shared auth state. When used outside an `AuthProvider` it
 * degrades to the not-configured sentinel (no thrown error), so individual
 * tests and any future consumer don't require the provider to be mounted.
 */
export function useAuth(): AuthState {
  return useContext(AuthContext);
}

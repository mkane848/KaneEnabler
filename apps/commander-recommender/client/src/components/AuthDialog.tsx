import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@mtg/profile';
import { useState, type FormEvent, type ReactNode } from 'react';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email + password only — no OAuth provider, no magic link. A profile is
 * optional scaffolding around the recommender's actual job (still fully
 * usable signed out), so this stays the smallest sign-in surface that
 * works rather than a full auth product.
 */
export function AuthDialog({ children }: { children: ReactNode }) {
  const { signIn, signUp } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetLocalState() {
    setMode('sign-in');
    setEmail('');
    setPassword('');
    setError(null);
    setConfirmSent(false);
    setSubmitting(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result =
      mode === 'sign-in' ? await signIn(email, password) : await signUp(email, password);

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'sign-up') {
      // Supabase's default project settings require confirming the address
      // before a session exists — signUp succeeding here doesn't mean
      // signed in yet.
      setConfirmSent(true);
      return;
    }
    setOpen(false);
    resetLocalState();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetLocalState();
      }}
    >
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-card auth-dialog-card">
            <div className="dialog-body">
              <Dialog.Title className="dialog-name">
                {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
              </Dialog.Title>

              {confirmSent ? (
                <p className="auth-confirm-note">
                  Check {email} for a confirmation link, then sign in.
                </p>
              ) : (
                <form className="auth-form" onSubmit={handleSubmit}>
                  <label className="auth-field-label" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    className="auth-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <label className="auth-field-label" htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    className="auth-input"
                    type="password"
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  {error && <p className="auth-error">{error}</p>}

                  <button type="submit" className="app-nav-link auth-submit" disabled={submitting}>
                    {submitting ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
                  </button>
                </form>
              )}

              {!confirmSent && (
                <p className="auth-switch">
                  {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    className="auth-switch-link"
                    onClick={() => {
                      setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                      setError(null);
                    }}
                  >
                    {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              )}

              <p className="auth-privacy-note">
                Your email and preferences are stored to run this feature and are never shared. See
                the About dialog for details.
              </p>
            </div>
          </div>

          <Dialog.Close className="dialog-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

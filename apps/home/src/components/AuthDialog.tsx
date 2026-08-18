import { useState, type FormEvent } from 'react';
import { useAuth } from '@mtg/profile';
import { Modal, ModalTitle } from '@mtg/ui';

type Mode = 'sign-in' | 'sign-up';

/**
 * Same email+password-only, no-OAuth scope as commander-recommender's own
 * AuthDialog (they share the same Supabase project and `auth.users` table,
 * so a mismatched sign-in surface here would be confusing, not just
 * inconsistent). This one exists separately rather than importing that
 * app's copy because it isn't published as a package — @mtg/ui's Modal and
 * @mtg/profile's useAuth are the actual shared parts.
 */
export function AuthDialog({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    onClose();
  }

  return (
    <Modal onClose={onClose} overlayClassName="modal-overlay" contentClassName="modal-content">
      <div className="auth-dialog-card">
        <ModalTitle className="auth-dialog-title">
          {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
        </ModalTitle>

        {confirmSent ? (
          <p className="auth-confirm-note">Check {email} for a confirmation link, then sign in.</p>
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

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="auth-submit" disabled={submitting}>
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
          One account works across every tool here. Your email and preferences are stored only to
          run this feature and are never shared.
        </p>
      </div>
    </Modal>
  );
}

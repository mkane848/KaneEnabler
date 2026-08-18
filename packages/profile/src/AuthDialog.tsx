import { useState, type FormEvent } from 'react';
import { Modal, ModalTitle } from '@mtg/ui';
import { useAuth } from './useAuth';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email + password only — no OAuth provider, no magic link. A profile is
 * optional scaffolding (every app stays fully usable signed out), so this
 * stays the smallest sign-in surface that works. Was three near-identical
 * copies (one raw-Radix, two already on @mtg/ui's Modal); this is the one
 * implementation every app now renders, styled via the --mtg-* platform
 * tokens so each app's sheet/backdrop keeps its own look without a
 * per-app override (same reasoning as AccountMenu.tsx/NavBar.tsx).
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
    <Modal
      onClose={onClose}
      overlayClassName="mtg-auth-dialog-overlay"
      contentClassName="mtg-auth-dialog-content"
    >
      <ModalTitle asChild>
        <h2 className="mtg-auth-dialog-title">
          {mode === 'sign-in' ? 'Sign in' : 'Create an account'}
        </h2>
      </ModalTitle>

      {confirmSent ? (
        <p className="mtg-auth-dialog-note">Check {email} for a confirmation link, then sign in.</p>
      ) : (
        <form className="mtg-auth-dialog-form" onSubmit={handleSubmit}>
          <label className="mtg-auth-dialog-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="mtg-auth-dialog-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="mtg-auth-dialog-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="mtg-auth-dialog-input"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="mtg-auth-dialog-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="mtg-auth-dialog-submit" disabled={submitting}>
            {submitting ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
      )}

      {!confirmSent && (
        <p className="mtg-auth-dialog-switch">
          {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="mtg-auth-dialog-switch-link"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
            }}
          >
            {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      )}

      <p className="mtg-auth-dialog-note">
        One account works across every tool on the platform. Your email and preferences are stored
        only to run this feature and are never shared.
      </p>
    </Modal>
  );
}

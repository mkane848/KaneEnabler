import { useState, type FormEvent } from 'react';
import { useAuth } from '@mtg/profile';
import { Modal, ModalTitle } from '@mtg/ui';
import styles from './AuthDialog.module.css';

type Mode = 'sign-in' | 'sign-up';

/**
 * Email+password only, same scope as commander-recommender's own
 * AuthDialog — they share the same Supabase project and auth.users table,
 * so signing in here also signs you in there. This app has no
 * account-gated features of its own yet; the sign-in menu exists so the
 * platform's one identity is consistent everywhere, not just where the
 * recommender's like/dislike/jank preferences live.
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
    <Modal onClose={onClose} overlayClassName={styles.backdrop} contentClassName={styles.sheet}>
      <ModalTitle asChild>
        <h2 className={styles.title}>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h2>
      </ModalTitle>

      {confirmSent ? (
        <p className={styles.note}>Check {email} for a confirmation link, then sign in.</p>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className={styles.label} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={submitting}>
            {submitting ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
      )}

      {!confirmSent && (
        <p className={styles.switch}>
          {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
            }}
          >
            {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      )}

      <p className={styles.note}>
        One account works across every tool on the platform. Your email and preferences are stored
        only to run this feature and are never shared.
      </p>
    </Modal>
  );
}

import { useState } from 'react';
import { useAuth } from '@mtg/profile';
import { AuthDialog } from './AuthDialog';
import styles from './AccountMenu.module.css';

/**
 * Signed out (or Supabase isn't configured for this deployment): a Sign in
 * trigger. Signed in: the account's email and a Sign out button. Same
 * Supabase project as the platform's home page and commander-recommender —
 * this app has no preferences of its own tied to the account yet, but
 * showing sign-in state here keeps the one identity consistent everywhere
 * on the platform rather than recommender-only.
 */
export function AccountMenu() {
  const { user, loading, configured, signOut } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <>
        <button type="button" className={styles.trigger} onClick={() => setDialogOpen(true)}>
          Sign in
        </button>
        {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
      </>
    );
  }

  return (
    <div className={styles.menu}>
      <span className={styles.email}>{user.email}</span>
      <button type="button" className={styles.trigger} onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

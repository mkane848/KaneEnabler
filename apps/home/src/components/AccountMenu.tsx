import { useState } from 'react';
import { useAuth } from '@mtg/profile';
import { AuthDialog } from './AuthDialog';

/**
 * Signed out (or Supabase isn't configured for this deployment): a Sign in
 * trigger. Signed in: the account's email and a Sign out button. The same
 * Supabase project backs commander-recommender's own account menu, so
 * signing in here also signs you in there (and vice versa) — this is the
 * one shared identity across every tool on the platform.
 */
export function AccountMenu() {
  const { user, loading, configured, signOut } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <>
        <button type="button" className="nav-link" onClick={() => setDialogOpen(true)}>
          Sign in
        </button>
        {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
      </>
    );
  }

  return (
    <div className="account-menu">
      <span className="account-email">{user.email}</span>
      <button type="button" className="nav-link" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

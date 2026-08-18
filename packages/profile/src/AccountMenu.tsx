import { useState } from 'react';
import { useAuth } from './useAuth';
import { AuthDialog } from './AuthDialog';

/**
 * Signed out (or Supabase isn't configured for this deployment): a Sign in
 * trigger. Signed in: the account's email and a Sign out button. One
 * Supabase project backs every app on the platform, so signing in here
 * signs you in everywhere — this used to be three near-identical copies
 * (one per app's own `components/`), each with its own classNames; now
 * there's one implementation, styled via the --mtg-* platform tokens each
 * app's own tokens.css/App.css/index.css defines, so it re-themes per app
 * without per-app overrides (see NavBar.tsx in @mtg/ui for the same
 * reasoning).
 */
export function AccountMenu() {
  const { user, loading, configured, signOut } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <>
        <button
          type="button"
          className="mtg-account-menu-trigger"
          onClick={() => setDialogOpen(true)}
        >
          Sign in
        </button>
        {dialogOpen && <AuthDialog onClose={() => setDialogOpen(false)} />}
      </>
    );
  }

  return (
    <div className="mtg-account-menu">
      <span className="mtg-account-menu-email">{user.email}</span>
      <button type="button" className="mtg-account-menu-trigger" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

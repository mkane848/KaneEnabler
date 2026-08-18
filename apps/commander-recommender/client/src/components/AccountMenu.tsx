import { useAuth } from '@mtg/profile';
import { AuthDialog } from './AuthDialog';

/**
 * Signed out (or Supabase isn't configured for this deployment): a Sign in
 * trigger. Signed in: the account's email and a Sign out button. Nothing
 * else in the app requires being signed in — this is the only place that
 * changes based on auth state.
 */
export function AccountMenu() {
  const { user, loading, configured, signOut } = useAuth();

  if (!configured || loading) return null;

  if (!user) {
    return (
      <AuthDialog>
        <button type="button" className="app-nav-link">
          Sign in
        </button>
      </AuthDialog>
    );
  }

  return (
    <div className="account-menu">
      <span className="account-email">{user.email}</span>
      <button type="button" className="app-nav-link" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

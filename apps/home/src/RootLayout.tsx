import { Outlet, useLocation } from '@tanstack/react-router';
import { NavBar, type NavBarLink } from '@mtg/ui';
import { AccountMenu, useAuth } from '@mtg/profile';

/**
 * The site chrome every route in this app renders inside — NavBar plus
 * wherever the router puts the active page. The Profile link only appears
 * once signed in, since /profile itself prompts to sign in rather than
 * showing an empty page. `pathname` is app-relative (this app's own routes
 * are '/' and '/profile'), so it only ever matches one of *this* app's own
 * links, never the cross-app ones — those are always a different tool.
 */
export default function RootLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const links: NavBarLink[] = [
    { label: 'Home', href: '/', current: pathname === '/' },
    { label: 'Recommender', href: '/recommender/' },
    { label: 'Time Counters', href: '/time-counters/' },
  ];
  if (user) {
    links.push({ label: 'Profile', href: '/profile', current: pathname === '/profile' });
  }

  return (
    <div className="page">
      <NavBar
        brand={{ label: 'KaneEnabler', href: '/' }}
        links={links}
        accountSlot={<AccountMenu />}
      />
      <Outlet />
    </div>
  );
}

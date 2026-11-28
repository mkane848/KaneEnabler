import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { NavBar, SiteFooter, type NavBarLink } from '@mtg/ui';
import { AccountMenu } from '@mtg/profile';
import { DEFAULT_SEARCH } from './lib/search';

/** Root-relative platform subpaths, as in the other tools' nav. */
const NAV_LINKS: NavBarLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Recommender', href: '/recommender/' },
  { label: 'Time Counters', href: '/time-counters/' },
  { label: 'Pokémon Decks', href: '/pokemon/', current: true },
];

export default function Layout() {
  const { pathname } = useLocation();
  const building = pathname.endsWith('/build');
  return (
    <div className="mtg-page">
      <NavBar
        brand={{ label: 'KaneEnabler', href: '/' }}
        links={NAV_LINKS}
        accountSlot={<AccountMenu />}
      />
      <main className="mtg-page-main">
        <header className="app-header">
          <h1 className="mtg-page-title">Pokémon deck builder</h1>
          <p className="mtg-page-subtitle">
            Find the decks hiding in your collection, or build around one Pokémon.
          </p>
          <nav className="mode-tabs" aria-label="Mode">
            <Link
              to="/"
              search={(prev) => ({ format: prev.format ?? DEFAULT_SEARCH.format })}
              className={building ? '' : 'active'}
            >
              From my collection
            </Link>
            <Link
              to="/build"
              search={(prev) => ({ format: prev.format ?? DEFAULT_SEARCH.format })}
              className={building ? 'active' : ''}
            >
              Build around a Pokémon
            </Link>
          </nav>
        </header>
        <Outlet />
      </main>
      <SiteFooter
        attribution={
          <p>
            Card data from TCGdex (tcgdex.dev). An unofficial fan tool, not affiliated with or
            endorsed by The Pokémon Company or Nintendo.
          </p>
        }
      >
        <p>
          Decks are a heuristic starting point, not a tested or meta-aware list. v{__APP_VERSION__}
        </p>
      </SiteFooter>
    </div>
  );
}

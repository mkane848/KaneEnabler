import { useEffect } from 'react';
import { NavBar, SiteFooter, type NavBarLink } from '@mtg/ui';
import { AccountMenu } from '@mtg/profile';
import { CardListUpload } from './components/CardListUpload';
import { RecommendationResults } from './components/RecommendationResults';
import { AboutDialog } from './components/AboutDialog';
import { wakeServer } from './api/client';

/**
 * Root-relative platform subpaths, not relative to this app's own base —
 * all three tools share one origin in production (root CLAUDE.md's
 * "Combined deploy"), same as apps/home's own pre-existing tool links.
 */
const NAV_LINKS: NavBarLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Recommender', href: '/recommender/', current: true },
  { label: 'Time Counters', href: '/time-counters/' },
];

function App() {
  // Start waking the API immediately, so a sleeping free instance is usually
  // up by the time anyone finishes pasting a list.
  useEffect(wakeServer, []);

  return (
    <div className="mtg-page">
      <NavBar
        brand={{ label: 'KaneEnabler', href: '/' }}
        links={NAV_LINKS}
        accountSlot={<AccountMenu />}
        extraSlot={
          <AboutDialog>
            <button type="button" className="mtg-btn mtg-btn-ghost app-nav-link">
              About
            </button>
          </AboutDialog>
        }
      />

      <main className="mtg-page-main app-main">
        <header className="app-header">
          <h1 className="mtg-page-title app-title">Find the Commander hiding in your collection</h1>
          <p className="mtg-page-subtitle">
            Paste or upload a card list. We'll look for synergies across it and suggest legal
            Commanders, with the reasoning behind each one.
          </p>
        </header>

        <CardListUpload />
        <RecommendationResults />
      </main>

      <SiteFooter>
        <p>Suggestions are a heuristic, not a model of how a deck actually plays.</p>
      </SiteFooter>
    </div>
  );
}

export default App;

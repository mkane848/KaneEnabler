import { useEffect } from 'react';
import { CardListUpload } from './components/CardListUpload';
import { RecommendationResults } from './components/RecommendationResults';
import { AboutDialog } from './components/AboutDialog';
import { wakeServer } from './api/client';

function App() {
  // Start waking the API immediately, so a sleeping free instance is usually
  // up by the time anyone finishes pasting a list.
  useEffect(wakeServer, []);

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-nav-brand">Commander? I Hardly Know 'Er</span>
        <AboutDialog>
          <button type="button" className="app-nav-link">
            About
          </button>
        </AboutDialog>
      </nav>

      <header className="app-header">
        <h1 className="app-title">Find the Commander hiding in your collection</h1>
        <p className="app-subtitle">
          Paste or upload a card list. We'll look for synergies across it and suggest legal Commanders,
          with the reasoning behind each one.
        </p>
      </header>

      <main className="app-main">
        <CardListUpload />
        <RecommendationResults />
      </main>

      <footer className="app-footer">
        <p>Card data via Scryfall. Suggestions are a heuristic, not a model of how a deck actually plays.</p>
      </footer>
    </div>
  );
}

export default App;

import { useMemo, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import type { Format } from '@ptcg/rules';
import { DeckView } from '../components/DeckView';
import { FormatPicker } from '../components/FormatPicker';
import { useCatalog } from '../data/useCatalog';
import { summarizeOwned } from '../engine/collection';
import { buildPool } from '../engine/pool';
import { recommendDecks } from '../engine/recommend';
import { loadCollectionText, saveCollectionText } from '../lib/collectionStorage';
import { parseList } from '../lib/parseList';

const route = getRouteApi('/');

export default function CollectionPage() {
  const { format } = route.useSearch();
  const navigate = route.useNavigate();
  const setFormat = (f: Format) => navigate({ search: { format: f } });
  const state = useCatalog(format);

  const [draft, setDraft] = useState(loadCollectionText);
  const [submitted, setSubmitted] = useState(draft);

  const result = useMemo(() => {
    if (state.status !== 'ready' || !submitted.trim()) return null;
    const parsed = parseList(submitted, state.catalog);
    const pool = buildPool(state.catalog, format);
    const owned = summarizeOwned(parsed.entries, pool.energyTypes);
    return { parsed, decks: recommendDecks(pool, owned) };
  }, [state, submitted, format]);

  return (
    <>
      <FormatPicker value={format} onChange={setFormat} />
      <form
        className="collection-form"
        onSubmit={(e) => {
          e.preventDefault();
          saveCollectionText(draft);
          setSubmitted(draft);
        }}
      >
        <label htmlFor="collection">Your cards</label>
        <p className="field-hint">
          Paste a Pokémon TCG Live export (“4 Iono PAL 185”), or one card per line with an optional
          count. Remembered in this browser only.
        </p>
        <textarea
          id="collection"
          className="mtg-input"
          rows={10}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            'Pokémon: 3\n2 Gastly POR 48\n1 Gengar ex TEF 104\n\nTrainer: 4\n4 Ultra Ball MEG 131'
          }
        />
        <button
          type="submit"
          className="mtg-btn mtg-btn-primary"
          disabled={state.status !== 'ready'}
        >
          Find decks
        </button>
      </form>

      {state.status === 'loading' && <p className="status">Loading card data…</p>}
      {state.status === 'error' && <p className="status-error">{state.error.message}</p>}

      {result && (
        <section className="results" aria-live="polite">
          <p className="results-summary">
            {result.parsed.total} cards read
            {result.parsed.unmatched.length > 0 &&
              `, ${result.parsed.unmatched.length} line${result.parsed.unmatched.length === 1 ? '' : 's'} not recognised`}
            . {result.decks.length} deck{result.decks.length === 1 ? '' : 's'} you can build toward.
          </p>
          {result.parsed.unmatched.length > 0 && (
            <details className="unmatched">
              <summary>Lines not recognised</summary>
              <ul>
                {result.parsed.unmatched.map((u, i) => (
                  <li key={i}>
                    <code>{u.line}</code> — {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.decks.length === 0 && (
            <p className="status">
              None of these cards start a deck in this format. Try another format, or build around a
              Pokémon instead.
            </p>
          )}
          <div className="deck-grid">
            {result.decks.map((deck) =>
              state.status === 'ready' ? (
                <DeckView
                  key={deck.attacker.id}
                  deck={deck}
                  catalog={state.catalog}
                  showOwnership
                />
              ) : null,
            )}
          </div>
        </section>
      )}
    </>
  );
}

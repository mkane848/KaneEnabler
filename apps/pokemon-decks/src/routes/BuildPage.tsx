import { useMemo, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import type { Format } from '@ptcg/rules';
import { DeckView } from '../components/DeckView';
import { FormatPicker } from '../components/FormatPicker';
import { useCatalog } from '../data/useCatalog';
import { buildDeck } from '../engine/build';
import { NOTHING_OWNED, summarizeOwned } from '../engine/collection';
import { buildPool } from '../engine/pool';
import { attackerCandidates } from '../engine/recommend';
import { loadCollectionText } from '../lib/collectionStorage';
import { normalizeName, parseList } from '../lib/parseList';

const route = getRouteApi('/build');
const MAX_MATCHES = 30;

export default function BuildPage() {
  const { format } = route.useSearch();
  const navigate = route.useNavigate();
  const setFormat = (f: Format) => navigate({ search: { format: f } });
  const state = useCatalog(format);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  const ready = state.status === 'ready' ? state.catalog : null;
  const pool = useMemo(() => (ready ? buildPool(ready, format) : null), [ready, format]);
  const candidates = useMemo(() => (pool ? attackerCandidates(pool) : []), [pool]);
  // A saved collection, if any, steers the build toward cards already owned.
  const owned = useMemo(() => {
    const text = loadCollectionText();
    if (!ready || !pool || !text.trim()) return NOTHING_OWNED;
    return summarizeOwned(parseList(text, ready).entries, pool.energyTypes);
  }, [ready, pool]);

  const matches = useMemo(() => {
    const q = normalizeName(query);
    if (q.length < 2) return [];
    return candidates.filter((c) => normalizeName(c.name).includes(q)).slice(0, MAX_MATCHES);
  }, [candidates, query]);

  const picked = pickedId ? candidates.find((c) => c.id === pickedId) : undefined;
  const deck = useMemo(
    () => (picked && pool ? buildDeck(picked, pool, { owned }) : null),
    [picked, pool, owned],
  );

  return (
    <>
      <FormatPicker
        value={format}
        onChange={(f) => {
          setPickedId(null);
          setFormat(f);
        }}
      />
      <div className="build-search">
        <label htmlFor="attacker">Main attacker</label>
        <input
          id="attacker"
          className="mtg-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a Pokémon's name"
          autoComplete="off"
          disabled={!ready}
        />
        {state.status === 'loading' && <p className="status">Loading card data…</p>}
        {state.status === 'error' && <p className="status-error">{state.error.message}</p>}
        {matches.length > 0 && (
          <ul className="attacker-matches" aria-label="Matching Pokémon">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`attacker-option${c.id === pickedId ? ' active' : ''}`}
                  aria-pressed={c.id === pickedId}
                  onClick={() => setPickedId(c.id)}
                >
                  <span>{c.name}</span>
                  <span className="attacker-meta">
                    {(c.types ?? []).join('/')} · {c.attacks?.map((a) => a.name).join(', ')} ·{' '}
                    {ready?.sets.get(c.setId)?.name ?? c.setId}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && matches.length === 0 && ready && (
          <p className="status">No attacker by that name in this format.</p>
        )}
      </div>
      {picked && ready && !deck && (
        <p className="status">
          Can&apos;t build around {picked.name} here: part of its evolution line isn&apos;t legal in
          this format{format === 'glc' ? ', or the line breaks a GLC rule' : ''}.
        </p>
      )}
      {deck && ready && <DeckView deck={deck} catalog={ready} showOwnership={owned.total > 0} />}
    </>
  );
}

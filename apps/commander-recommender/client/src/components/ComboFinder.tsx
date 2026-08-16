import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePreferencesStore, COMBOS_PAGE_SIZE_OPTIONS } from '../store/usePreferencesStore';
import { useCombos } from '../api/queries';
import { Pagination } from './Pagination';
import type { ComboDTO } from '../types';

/**
 * One "Ready to go" or "Almost there" group, paginated on its own — a
 * commander with a lot of combo pieces in your list can turn up enough of
 * either to stretch the page well past the fold on their own, same problem
 * as an uncapped suggestion grid.
 */
function ComboList({ combos, showMissing, pageSize }: { combos: ComboDTO[]; showMissing?: boolean; pageSize: number }) {
  const [pageIndex, setPageIndex] = useState(0);
  // A shorter list, or a changed page-size preference, can leave pageIndex
  // pointing past the end — land back on page 1 rather than an empty page.
  useEffect(() => setPageIndex(0), [combos, pageSize]);

  const pageCount = Math.max(1, Math.ceil(combos.length / pageSize));
  const clampedIndex = Math.min(pageIndex, pageCount - 1);
  const page = combos.slice(clampedIndex * pageSize, clampedIndex * pageSize + pageSize);

  return (
    <>
      <ul className="combo-list">
        {page.map((combo) => (
          <li key={combo.id ?? combo.cards.join('+')} className="combo-item">
            <p className="combo-cards">{combo.cards.join(' + ')}</p>

            {combo.produces.length > 0 && (
              <p className="combo-produces">
                <span className="combo-arrow" aria-hidden="true">
                  →
                </span>
                <span className="combo-produces-list">{combo.produces.join(', ')}</span>
              </p>
            )}

            {showMissing && combo.missing.length > 0 && (
              <p className="combo-missing">Missing: {combo.missing.join(', ')}</p>
            )}

            {/* Steps can run to a full paragraph of rules text — collapsed by
                default so a handful of combos doesn't turn into a wall of text
                to scroll past just to compare which ones are worth chasing. */}
            {combo.description && (
              <details className="combo-steps-details">
                <summary>Steps</summary>
                <p className="combo-steps">{combo.description}</p>
              </details>
            )}

            {combo.permalink && (
              <a className="combo-link" href={combo.permalink} target="_blank" rel="noreferrer noopener">
                View on Commander Spellbook
              </a>
            )}
          </li>
        ))}
      </ul>

      <Pagination
        pageIndex={clampedIndex}
        pageCount={pageCount}
        onPageChange={setPageIndex}
        label="Combo pages"
      />
    </>
  );
}

/**
 * Explicit, click-to-run combo lookup. Nothing is requested from Commander
 * Spellbook until the user asks for it, so browsing suggestions never
 * generates traffic against their API.
 *
 * The lookup is keyed on the submitted list rather than the textarea's
 * current contents, so editing the box after getting results doesn't quietly
 * ask about a different deck than the one on screen.
 */
export function ComboFinder({ commanderNames }: { commanderNames: string[] }) {
  const submittedList = useAppStore((s) => s.submittedList);
  const [requested, setRequested] = useState(false);
  const { data, error, isFetching, refetch } = useCombos(commanderNames, submittedList, requested);
  const combosPerPage = usePreferencesStore((s) => s.combosPerPage);
  const setCombosPerPage = usePreferencesStore((s) => s.setCombosPerPage);

  // Shown by default the moment results actually land — collapsing is
  // something the user chooses to do after seeing them, never something
  // that hides a fresh answer to the question they just asked. Re-opens on
  // every new `data` reference, which covers both the first fetch and a
  // "Try again" refetch.
  const [resultsVisible, setResultsVisible] = useState(true);
  useEffect(() => {
    if (data) setResultsVisible(true);
  }, [data]);

  // `data` is served from cache even while disabled, so collapsing this panel
  // and reopening it shows the previous answer instead of asking again.
  const showIdle = !data && !isFetching && !error;
  const nothingFound = data && data.ready.length === 0 && data.almost.length === 0;
  const resultCount = data ? data.ready.length + data.almost.length : 0;

  return (
    <section className="explain-section">
      <div className="explain-section-header">
        <h4 className="explain-heading">Combos</h4>
        {data && !isFetching && resultCount > 0 && (
          <button type="button" className="link-button" onClick={() => setResultsVisible((v) => !v)}>
            {resultsVisible ? 'Hide results' : `Show ${resultCount} result${resultCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {showIdle && (
        <>
          <p className="explain-group-desc">
            Check Commander Spellbook for combos between this commander and the cards in your list that
            fit its color identity.
          </p>
          <div className="combo-button-row">
            <button type="button" className="combo-button" onClick={() => setRequested(true)}>
              Find combos
            </button>
            {/* Placeholder only — no request is made and no EDHREC data is
                fetched. EDHREC access is still an open question (see
                handoff.md); this just reserves the spot in the UI for a
                future one-time, click-to-run lookup matching how the combo
                button above works. */}
            <button type="button" className="combo-button combo-button-placeholder" disabled title="Coming soon">
              EDHRec
            </button>
          </div>
        </>
      )}

      {isFetching && <p className="explain-group-desc">Asking Commander Spellbook…</p>}

      {error && !isFetching && (
        <>
          <p className="combo-error">{error instanceof Error ? error.message : 'Combo lookup failed.'}</p>
          <button type="button" className="combo-button" onClick={() => refetch()}>
            Try again
          </button>
        </>
      )}

      {data && !isFetching && resultsVisible && (
        <>
          <div className="explain-group-header">
            <p className="explain-group-desc">
              Searched {data.searchedCardCount} card{data.searchedCardCount === 1 ? '' : 's'} from your list
              {data.cached ? ' (cached)' : ''}.
            </p>
            {/* A standing preference (see usePreferencesStore), not local to
                this one commander — set once, applies to every combo list
                from here on. */}
            {resultCount > combosPerPage && (
              <label className="sort-control">
                <span className="filter-label">Show</span>
                <select value={combosPerPage} onChange={(event) => setCombosPerPage(Number(event.target.value))}>
                  {COMBOS_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {nothingFound && <p className="explain-group-desc">No combos found with these cards.</p>}

          {data.ready.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Ready to go <span className="explain-count">{data.ready.length}</span>
              </p>
              <p className="explain-group-desc">Every piece is already in your list.</p>
              <ComboList combos={data.ready} pageSize={combosPerPage} />
            </div>
          )}

          {data.almost.length > 0 && (
            <div className="explain-group">
              <p className="explain-group-title">
                Almost there <span className="explain-count">{data.almost.length}</span>
              </p>
              <p className="explain-group-desc">A card or two short.</p>
              <ComboList combos={data.almost} showMissing pageSize={combosPerPage} />
            </div>
          )}

          <p className="combo-credit">
            Combo data from{' '}
            <a href="https://commanderspellbook.com/" target="_blank" rel="noreferrer noopener">
              Commander Spellbook
            </a>
            .
          </p>
        </>
      )}
    </section>
  );
}

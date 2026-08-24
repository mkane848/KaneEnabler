import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/queries';
import {
  applyFilters,
  availableFilterValues,
  EMPTY_FILTERS,
  hasActiveFilters,
  type SuggestionFilters,
} from '../lib/filters';
import { sortSuggestions, type SortDirection, type SortMode } from '../lib/sort';
import { CommanderCard } from './CommanderCard';
import { DeckSummary } from './DeckSummary';
import { ResultFilters } from './ResultFilters';
import type { CommanderSuggestionDTO } from '../types';

const routeApi = getRouteApi('/');

const EXPORT_FILENAME = 'commander-suggestions.txt';

function toExportText(suggestions: CommanderSuggestionDTO[]): string {
  return suggestions.map((s) => s.cards.map((c) => c.name).join(' + ')).join('\n');
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Copy button feedback resets on its own after a beat, same idea as the
 * "waking the server" notice elsewhere — confirm, then get out of the way. */
function ExportControls({ suggestions }: { suggestions: CommanderSuggestionDTO[] }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toExportText(suggestions));
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the download button
      // next to this one still works, so there's no need to surface an error.
    }
  }

  return (
    <div className="export-controls">
      <button type="button" className="export-button" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy list'}
      </button>
      <button
        type="button"
        className="export-button"
        onClick={() => downloadTextFile(EXPORT_FILENAME, toExportText(suggestions))}
      >
        Download .txt
      </button>
    </div>
  );
}

/** Matches .suggestion-grid-row's own track width and gap in index.css —
 * the same numbers CSS's repeat(auto-fill, minmax(260px, 1fr)) used to lay
 * the grid out with directly. A virtualized grid needs to decide row
 * membership in JS before anything renders, so it has to reproduce that
 * math instead of leaving it to the browser. */
const MIN_CARD_WIDTH = 260;
const GRID_GAP = 20;
/** A reasonable starting guess for one row's height; corrected after each
 * row's first real render via the virtualizer's own measureElement. */
const ESTIMATED_ROW_HEIGHT = 460;

/**
 * How many columns the grid lays out at its current width — the same
 * result CSS's own `repeat(auto-fill, minmax(260px, 1fr))` would produce,
 * recomputed on resize. Suggestions are grouped into rows of this many so
 * the row virtualizer below can decide what to render before anything
 * paints, the same job the CSS grid used to do implicitly.
 *
 * A callback ref rather than a plain useRef + useEffect: this component
 * returns null (no grid, no DOM node) until the suggestions finish loading,
 * so an effect keyed on the ref *object* (which never changes identity)
 * would run once too early, see no element yet, and never get a second
 * chance once the grid actually mounts. A callback ref fires on every real
 * attach — including this later one — so it can't miss it.
 */
function useGridColumns() {
  const [columns, setColumns] = useState(1);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    elementRef.current = el;
    if (!el) return;

    const measure = (width: number) => {
      setColumns(Math.max(1, Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))));
    };
    measure(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return { ref, columns, elementRef };
}

export function RecommendationResults() {
  const submittedList = useAppStore((s) => s.submittedList);
  const dismissed = useAppStore((s) => s.dismissed);
  const restoreAll = useAppStore((s) => s.restoreAll);
  const { data: result, error } = useRecommendations(submittedList);

  // Filters/sort live in the URL (see lib/searchSchema.ts) rather than
  // component state — shareable, and survives a refresh.
  const { filters, sortMode, sortDirection } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  function setFilters(next: SuggestionFilters) {
    navigate({ search: (prev) => ({ ...prev, filters: next }) });
  }
  function setSortMode(next: SortMode) {
    navigate({ search: (prev) => ({ ...prev, sortMode: next }) });
  }
  function setSortDirection(next: SortDirection) {
    navigate({ search: (prev) => ({ ...prev, sortDirection: next }) });
  }

  const suggestions = useMemo(() => result?.suggestions ?? [], [result]);
  const alsoPlayable = useMemo(() => result?.alsoPlayable ?? [], [result]);

  // Dismissals and filters are separate ideas: dismissing is the user saying
  // "not this one", filtering is "not right now". Both narrow the grid, but
  // the counts below report them separately so neither hides the other.
  const kept = useMemo(
    () => suggestions.filter((s) => !dismissed.includes(s.unitId)),
    [suggestions, dismissed],
  );
  const filtered = useMemo(() => applyFilters(kept, filters), [kept, filters]);
  const sorted = useMemo(
    () => sortSuggestions(filtered, sortMode, sortDirection),
    [filtered, sortMode, sortDirection],
  );
  const { brackets, themes, colors, hasColorless, hasMulticolor } = useMemo(
    () => availableFilterValues(kept),
    [kept],
  );

  // The coverage tier runs through the same dismissal set and filter bar as
  // the main grid — a Black filter producing an empty main grid above a
  // full, unfiltered coverage list would be a worse bug than the one this
  // tier exists to fix. See docs/recommendation-coverage.md.
  const alsoPlayableKept = useMemo(
    () => alsoPlayable.filter((s) => !dismissed.includes(s.unitId)),
    [alsoPlayable, dismissed],
  );
  const alsoPlayableFiltered = useMemo(
    () => applyFilters(alsoPlayableKept, filters),
    [alsoPlayableKept, filters],
  );
  const alsoPlayableSorted = useMemo(
    () => sortSuggestions(alsoPlayableFiltered, sortMode, sortDirection),
    [alsoPlayableFiltered, sortMode, sortDirection],
  );

  // The whole page scrolls (no inner scroll pane — see .app-shell in
  // index.css), so this virtualizes against the window rather than a fixed-
  // height container. gridElementRef doubles as both the column-count
  // probe inside useGridColumns and the scrollMargin anchor below:
  // offsetTop is how far down the page the grid's own top edge sits, which
  // is what lets the virtualizer place rows at the right point in real page
  // coordinates.
  const { ref: gridRef, columns: columnCount, elementRef: gridElementRef } = useGridColumns();
  const rowCount = Math.ceil(sorted.length / columnCount);

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    scrollMargin: gridElementRef.current?.offsetTop ?? 0,
  });

  if (error) {
    return (
      <p className="status-error">
        {error instanceof Error ? error.message : 'Something went wrong.'}
      </p>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <section className="results">
      {/* Said before the results, not after: these are the closest few rather
          than a ranking, and presenting them silently would imply a
          confidence the scoring never had. */}
      {result.weakMatchesOnly && result.suggestions.length > 0 && (
        <p className="weak-match-note">
          No commander matched this list strongly — nothing turned up a deep synergy or more than
          one shared theme. These are the closest few; treat them as a starting point rather than a
          ranking. Adding more cards that pull in the same direction will sharpen this.
        </p>
      )}
      <div className="results-summary">
        <span>
          {result.totalMatched} of {result.totalParsed} cards matched
        </span>
        {/* Called out separately from "not found": these cards were
            recognised, they just cannot all be in one deck. Without this the
            matched count would look like a failed lookup. */}
        {result.ignoredCopies > 0 && (
          <span className="singleton-note">
            {result.ignoredCopies} extra {result.ignoredCopies === 1 ? 'copy' : 'copies'} ignored —
            Commander is singleton
          </span>
        )}
        {result.notFound.length > 0 && (
          <details>
            <summary>{result.notFound.length} not found</summary>
            <ul>
              {result.notFound.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
        {/* Also called out separately from "not found": these were
            recognised too, just not usable — banned cards don't count as
            synergy support, so silently dropping them without saying so
            would look like the list matched fewer cards than it did. */}
        {result.banned.length > 0 && (
          <details>
            <summary>{result.banned.length} banned in Commander</summary>
            <ul>
              {result.banned.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        )}
        {dismissed.length > 0 && (
          <span className="dismissed-note">
            {dismissed.length} dismissed
            <button type="button" className="link-button" onClick={restoreAll}>
              Restore all
            </button>
          </span>
        )}
        {sorted.length > 0 && <ExportControls suggestions={sorted} />}
      </div>

      {/* Above the commander grid, because it is about the list rather than
          the suggestions — and because a list that can't execute its own
          game plan is worth knowing before shopping for a commander. */}
      <DeckSummary deck={result.deck} />

      {suggestions.length === 0 ? (
        <p className="status-empty">
          No strong Commander synergies found yet — try uploading a larger or more varied list.
        </p>
      ) : (
        <>
          <ResultFilters
            filters={filters}
            onChange={setFilters}
            availableBrackets={brackets}
            availableThemes={themes}
            availableColors={colors}
            hasColorless={hasColorless}
            hasMulticolor={hasMulticolor}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            shown={filtered.length}
            total={kept.length}
          />

          {filtered.length === 0 ? (
            <p className="status-empty">
              {hasActiveFilters(filters)
                ? 'No commanders match these filters.'
                : 'You have dismissed every suggestion.'}{' '}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  hasActiveFilters(filters) ? setFilters(EMPTY_FILTERS) : restoreAll()
                }
              >
                {hasActiveFilters(filters) ? 'Clear filters' : 'Restore all'}
              </button>
            </p>
          ) : (
            <div
              ref={gridRef}
              className="suggestion-grid-virtual"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * columnCount;
                const rowSuggestions = sorted.slice(start, start + columnCount);
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="suggestion-grid-row"
                    style={{
                      ['--suggestion-grid-columns' as string]: columnCount,
                      transform: `translateY(${
                        virtualRow.start - rowVirtualizer.options.scrollMargin
                      }px)`,
                    }}
                  >
                    {rowSuggestions.map((suggestion) => (
                      <CommanderCard key={suggestion.unitId} suggestion={suggestion} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* A second, clearly-labelled tier below the confident ranking, so a
          weak pick never reads as a strong one. Unconditional on the main
          grid being non-empty — a list with no confident match can still
          have a commander it already owns. */}
      {alsoPlayableSorted.length > 0 && (
        <section className="coverage-section">
          <h2>Also playable</h2>
          <p className="coverage-intro">
            Commanders already in your list, and narrower picks that rescue cards nothing above
            cites — a weaker case than the ranking, worth a look rather than a recommendation.
          </p>
          <div className="coverage-grid">
            {alsoPlayableSorted.map((suggestion) => (
              <CommanderCard key={suggestion.unitId} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

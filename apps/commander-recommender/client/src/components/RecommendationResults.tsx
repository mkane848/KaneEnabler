import { useEffect, useMemo, useState } from 'react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from '@tanstack/react-table';
import { useAppStore } from '../store/useAppStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useRecommendations } from '../api/queries';
import { applyFilters, availableFilterValues, EMPTY_FILTERS, hasActiveFilters } from '../lib/filters';
import { sortSuggestions, type SortDirection, type SortMode } from '../lib/sort';
import { CommanderCard } from './CommanderCard';
import { DeckSummary } from './DeckSummary';
import { Pagination } from './Pagination';
import { ResultFilters } from './ResultFilters';
import type { CommanderSuggestionDTO } from '../types';

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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toExportText(suggestions));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

export function RecommendationResults() {
  const submittedList = useAppStore((s) => s.submittedList);
  const dismissed = useAppStore((s) => s.dismissed);
  const restoreAll = useAppStore((s) => s.restoreAll);
  const { data: result, error } = useRecommendations(submittedList);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const suggestionsPerPage = usePreferencesStore((s) => s.suggestionsPerPage);
  const setSuggestionsPerPage = usePreferencesStore((s) => s.setSuggestionsPerPage);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: suggestionsPerPage });

  // The table's pagination is controlled (below) so the page-size preference
  // can drive it after mount, not just seed it once. Landing back on page 1
  // avoids being stranded on a page number that no longer exists once the
  // page is shorter.
  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: suggestionsPerPage });
  }, [suggestionsPerPage]);

  const suggestions = useMemo(() => result?.suggestions ?? [], [result]);

  // Dismissals and filters are separate ideas: dismissing is the user saying
  // "not this one", filtering is "not right now". Both narrow the grid, but
  // the counts below report them separately so neither hides the other.
  const kept = useMemo(
    () => suggestions.filter((s) => !dismissed.includes(s.unitId)),
    [suggestions, dismissed]
  );
  const filtered = useMemo(() => applyFilters(kept, filters), [kept, filters]);
  const sorted = useMemo(
    () => sortSuggestions(filtered, sortMode, sortDirection),
    [filtered, sortMode, sortDirection]
  );
  const { brackets, themes, hasColorless, hasMulticolor } = useMemo(() => availableFilterValues(kept), [kept]);

  // TanStack Table is used headlessly here, purely for the pagination state
  // machine — page bounds, and resetting to page 1 when filtering or sorting
  // changes the row set under you. Filtering and sorting themselves stay
  // plain functions in lib, since they cut across the whole row rather than
  // down one column.
  const columns = useMemo<ColumnDef<CommanderSuggestionDTO>[]>(
    () => [{ id: 'suggestion', accessorKey: 'unitId' }],
    []
  );

  const table = useReactTable({
    data: sorted,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  if (error) {
    return <p className="status-error">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
  }

  if (!result) {
    return null;
  }

  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const rows = table.getRowModel().rows;

  return (
    <section className="results">
      {/* Said before the results, not after: these are the closest few rather
          than a ranking, and presenting them silently would imply a
          confidence the scoring never had. */}
      {result.weakMatchesOnly && result.suggestions.length > 0 && (
        <p className="weak-match-note">
          No commander matched this list strongly — nothing turned up a deep synergy or more than one shared
          theme. These are the closest few; treat them as a starting point rather than a ranking. Adding more
          cards that pull in the same direction will sharpen this.
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
            {result.ignoredCopies} extra {result.ignoredCopies === 1 ? 'copy' : 'copies'} ignored — Commander is
            singleton
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
            hasColorless={hasColorless}
            hasMulticolor={hasMulticolor}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            pageSize={suggestionsPerPage}
            onPageSizeChange={setSuggestionsPerPage}
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
                onClick={() => (hasActiveFilters(filters) ? setFilters(EMPTY_FILTERS) : restoreAll())}
              >
                {hasActiveFilters(filters) ? 'Clear filters' : 'Restore all'}
              </button>
            </p>
          ) : (
            <>
              <div className="suggestion-grid">
                {rows.map((row) => (
                  <CommanderCard key={row.original.unitId} suggestion={row.original} />
                ))}
              </div>

              <Pagination
                pageIndex={pageIndex}
                pageCount={pageCount}
                onPageChange={(index) => table.setPageIndex(index)}
                label="Suggestion pages"
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

import { useState } from 'react';

interface Props {
  pageIndex: number;
  pageCount: number;
  onPageChange: (index: number) => void;
  /** Distinguishes the several pagers that can share one screen (the grid,
   * plus one per combo group) for screen readers. */
  label: string;
}

/**
 * How many numbered buttons to show around the current page before falling
 * back to an ellipsis. First and last are always reachable, so the widest
 * this ever renders is: first, gap, three around current, gap, last.
 */
const WINDOW = 1;

/**
 * Builds the page numbers to render, with `null` marking a skipped run.
 *
 * Every page is reachable by number when there are few enough of them; once
 * there are many, the first, last and a window around the current page stay
 * clickable and the rest collapse. Without that a few hundred suggestions at
 * nine per page would render a row of numbers wider than the screen.
 */
function pageItems(pageIndex: number, pageCount: number): (number | null)[] {
  const pages = new Set<number>([0, pageCount - 1]);
  for (let i = pageIndex - WINDOW; i <= pageIndex + WINDOW; i++) {
    if (i >= 0 && i < pageCount) pages.add(i);
  }

  const ordered = [...pages].sort((a, b) => a - b);
  const items: (number | null)[] = [];
  let previous: number | null = null;
  for (const page of ordered) {
    if (previous !== null && page - previous > 1) items.push(null);
    items.push(page);
    previous = page;
  }
  return items;
}

/**
 * How many pages there have to be before typing a page number beats clicking
 * one. Below this the numbered buttons are all on screen anyway, so a text
 * box would just be clutter.
 */
const JUMP_BOX_THRESHOLD = 10;

/** Previous/Next, numbered pages, and — once there are enough pages that the
 * numbers start collapsing behind ellipses — a box to type one into. Shared
 * by the suggestion grid and each combo group. */
export function Pagination({ pageIndex, pageCount, onPageChange, label }: Props) {
  // Hooks run before the early return below, since a component may not change
  // how many it calls between renders.
  const [draft, setDraft] = useState('');

  if (pageCount <= 1) return null;

  const items = pageItems(pageIndex, pageCount);

  const commitJump = () => {
    const requested = Number(draft);
    // Silently ignore anything that isn't a page — an empty box, a stray
    // letter, 0, or a number past the end. Clearing the box on a bad entry
    // is feedback enough for a control this small.
    if (Number.isInteger(requested) && requested >= 1 && requested <= pageCount) {
      onPageChange(requested - 1);
    }
    setDraft('');
  };

  return (
    <nav className="pagination" aria-label={label}>
      <button
        type="button"
        className="page-button"
        onClick={() => onPageChange(pageIndex - 1)}
        disabled={pageIndex === 0}
      >
        ← Previous
      </button>

      <span className="page-numbers">
        {items.map((page, i) =>
          page === null ? (
            // Purely decorative: the pages it stands for are still reachable
            // by stepping, so it is hidden rather than announced as content.
            <span key={`gap-${i}`} className="page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              className={`page-number${page === pageIndex ? ' is-current' : ''}`}
              onClick={() => onPageChange(page)}
              aria-label={`Page ${page + 1}`}
              aria-current={page === pageIndex ? 'page' : undefined}
            >
              {page + 1}
            </button>
          )
        )}
      </span>

      <button
        type="button"
        className="page-button"
        onClick={() => onPageChange(pageIndex + 1)}
        disabled={pageIndex >= pageCount - 1}
      >
        Next →
      </button>

      {pageCount >= JUMP_BOX_THRESHOLD && (
        // A form so Enter submits natively and the browser's own validation
        // and mobile keyboards come along for free.
        <form
          className="page-jump"
          onSubmit={(event) => {
            event.preventDefault();
            commitJump();
          }}
        >
          <label className="page-jump-label" htmlFor={`${label}-jump`}>
            Go to
          </label>
          <input
            id={`${label}-jump`}
            className="page-jump-input"
            // `inputMode` rather than `type="number"`, whose spinners and
            // scroll-to-change behaviour are a nuisance in a control this
            // small — while still bringing up a numeric keypad on mobile.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            placeholder={String(pageIndex + 1)}
            aria-label={`Go to page (1 to ${pageCount})`}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
            // Committing on blur as well as submit, so clicking away isn't
            // silently discarded.
            onBlur={commitJump}
          />
          <span className="page-jump-total">of {pageCount}</span>
        </form>
      )}
    </nav>
  );
}

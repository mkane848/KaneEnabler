import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Durable UI preferences — how many results to show per page, wherever
 * pagination shows up. Kept separate from useAppStore, which is deliberately
 * *not* persisted: rawList/submittedList/dismissed belong to one browsing
 * session, and carrying dismissals over to a browser restart (against
 * whatever list happens to be pasted in next) would be surprising. A page
 * size preference has the opposite property — it should outlive the tab.
 */
interface PreferencesState {
  suggestionsPerPage: number;
  combosPerPage: number;
  setSuggestionsPerPage: (n: number) => void;
  setCombosPerPage: (n: number) => void;
}

/**
 * Suggestion page sizes.
 *
 * Every value divides by 1, 2, 3 and 4, which is what stops a partly-filled
 * last row: the grid is `repeat(auto-fill, minmax(260px, 1fr))`, so it lays
 * out at one to four columns depending on width. That constraint is why the
 * conventional 10/25/50/100 doesn't work here — 10 leaves an orphan at three
 * across.
 *
 * These were 9/18/36/72, which had the same property at one to three columns
 * but not four, and read oddly. 12/24/48/96 keeps the alignment, covers wide
 * screens too, and looks like the numbers people expect.
 */
export const SUGGESTIONS_PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
export const COMBOS_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      suggestionsPerPage: SUGGESTIONS_PAGE_SIZE_OPTIONS[0],
      combosPerPage: COMBOS_PAGE_SIZE_OPTIONS[1],
      setSuggestionsPerPage: (n) => set({ suggestionsPerPage: n }),
      setCombosPerPage: (n) => set({ combosPerPage: n }),
    }),
    {
      name: 'mtg-recommender-preferences',
      // Bumped when the page-size options changed from 9/18/36/72. A stored
      // 9 is no longer offered, and a <select> whose value matches no option
      // renders blank — so anyone who had ever touched the control would
      // come back to an empty dropdown. Rather than special-casing those
      // four numbers, anything not currently on offer falls back to the
      // default, which keeps this correct for the next change too.
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<PreferencesState> | undefined;
        return {
          ...state,
          suggestionsPerPage: nearestOption(
            state?.suggestionsPerPage,
            SUGGESTIONS_PAGE_SIZE_OPTIONS,
            SUGGESTIONS_PAGE_SIZE_OPTIONS[0]
          ),
          combosPerPage: nearestOption(
            state?.combosPerPage,
            COMBOS_PAGE_SIZE_OPTIONS,
            COMBOS_PAGE_SIZE_OPTIONS[1]
          ),
        } as PreferencesState;
      },
    }
  )
);

/**
 * The offered option closest to a stored value, or the default when there's
 * nothing to go on.
 *
 * Closest rather than default-always so a deliberate "show me lots" survives
 * a change to the option list: someone on 72 lands on 96, not back on 12.
 */
function nearestOption(
  stored: number | undefined,
  options: readonly number[],
  fallback: number
): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return fallback;
  if (options.includes(stored)) return stored;
  return options.reduce((best, option) =>
    Math.abs(option - stored) < Math.abs(best - stored) ? option : best
  );
}

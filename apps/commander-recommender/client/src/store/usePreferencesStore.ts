import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Durable UI preferences. Kept separate from useAppStore, which is
 * deliberately *not* persisted: rawList/submittedList/dismissed belong to
 * one browsing session, and carrying dismissals over to a browser restart
 * (against whatever list happens to be pasted in next) would be surprising.
 * A preference like this has the opposite property — it should outlive the
 * tab.
 *
 * The suggestion grid itself has no page-size preference any more — it's
 * virtualized (see RecommendationResults.tsx), so there's no "how many per
 * page" to remember. Combo results still paginate (ComboFinder.tsx), so
 * that preference stays.
 */
interface PreferencesState {
  combosPerPage: number;
  setCombosPerPage: (n: number) => void;
}

export const COMBOS_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      combosPerPage: COMBOS_PAGE_SIZE_OPTIONS[1],
      setCombosPerPage: (n) => set({ combosPerPage: n }),
    }),
    {
      name: 'mtg-recommender-preferences',
      // Bumped past the version that also stored suggestionsPerPage — that
      // field is gone now that the suggestion grid is virtualized instead
      // of paginated (see RecommendationResults.tsx). The migration just
      // drops it; nothing reads it any more, and there's no option list to
      // validate it against.
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<PreferencesState> | undefined;
        return {
          combosPerPage: nearestOption(
            state?.combosPerPage,
            COMBOS_PAGE_SIZE_OPTIONS,
            COMBOS_PAGE_SIZE_OPTIONS[1],
          ),
        } as PreferencesState;
      },
    },
  ),
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
  fallback: number,
): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return fallback;
  if (options.includes(stored)) return stored;
  return options.reduce((best, option) =>
    Math.abs(option - stored) < Math.abs(best - stored) ? option : best,
  );
}

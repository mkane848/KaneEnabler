import { create } from 'zustand';

/**
 * Client state only.
 *
 * Anything fetched from the server — recommendations, combos — lives in
 * TanStack Query instead (see api/queries.ts), which owns caching and
 * loading/error state for it. This store is for things the user is
 * manipulating directly, which is where an account's session and preferences
 * would go later.
 */
interface AppState {
  /** Live textarea contents. */
  rawList: string;
  /** The list actually submitted — the key everything server-side hangs off. */
  submittedList: string;
  /** unitIds the user has dismissed from the current results. */
  dismissed: string[];
  setRawList: (text: string) => void;
  submitList: (text: string) => void;
  dismiss: (unitId: string) => void;
  restore: (unitId: string) => void;
  restoreAll: () => void;
  /** Clears the list, the results, and any dismissals. */
  resetList: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  rawList: '',
  submittedList: '',
  dismissed: [],

  setRawList: (rawList) => set({ rawList }),

  // Dismissals belong to the list they were made against, so a genuinely new
  // list starts clean. Re-submitting the same text keeps them, since that is
  // the same set of results the user was already curating.
  submitList: (submittedList) =>
    set((state) => ({
      submittedList,
      dismissed: submittedList === state.submittedList ? state.dismissed : [],
    })),

  dismiss: (unitId) =>
    set((state) => ({
      dismissed: state.dismissed.includes(unitId) ? state.dismissed : [...state.dismissed, unitId],
    })),

  restore: (unitId) => set((state) => ({ dismissed: state.dismissed.filter((id) => id !== unitId) })),

  restoreAll: () => set({ dismissed: [] }),

  // Back to a blank slate: the textarea, the submitted list, and any
  // dismissals. Clearing submittedList is what actually retires the results,
  // since every server query is keyed on it.
  resetList: () => set({ rawList: '', submittedList: '', dismissed: [] }),
}));

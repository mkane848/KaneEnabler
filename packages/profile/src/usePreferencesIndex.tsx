import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { useCardPreferences } from './useCardPreferences';
import { useComboPreferences } from './useComboPreferences';
import type { CardPreference, ComboPreference } from './types';

interface PreferencesContextValue {
  cardByOracleId: Map<string, CardPreference>;
  comboByKey: Map<string, ComboPreference>;
}

const EMPTY_INDEX: PreferencesContextValue = {
  cardByOracleId: new Map(),
  comboByKey: new Map(),
};

const PreferencesContext = createContext<PreferencesContextValue>(EMPTY_INDEX);

/**
 * Fetches the signed-in user's card and combo preferences exactly once per
 * user (the two `use*Preferences` queries are already keyed and cached by
 * TanStack Query), then exposes memoized indexes so every consumer reads a
 * prebuilt lookup instead of rebuilding a `Map` or `.find`-ing per row.
 *
 * This is what removes F4 from the audit: `LikeDislikeButtons` was building
 * a fresh `Map` over *all* preferences inside every suggestion card, and
 * `ComboFavoriteButton` a linear `.find` per combo row. With this mounted
 * above the grid (see the app roots), each is one context read + one map
 * lookup, building the indexes at most once per render cycle.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: cardPreferences } = useCardPreferences(user?.id ?? null);
  const { data: comboPreferences } = useComboPreferences(user?.id ?? null);

  const value = useMemo<PreferencesContextValue>(() => {
    const cardByOracleId = new Map<string, CardPreference>();
    for (const preference of cardPreferences ?? []) {
      cardByOracleId.set(preference.oracleId, preference);
    }
    const comboByKey = new Map<string, ComboPreference>();
    for (const preference of comboPreferences ?? []) {
      comboByKey.set(preference.comboKey, preference);
    }
    return { cardByOracleId, comboByKey };
  }, [cardPreferences, comboPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/** Indexed lookup over the user's card preferences, keyed by oracle_id. */
export function useCardPreferencesIndex(): Map<string, CardPreference> {
  return useContext(PreferencesContext).cardByOracleId;
}

/** Indexed lookup over the user's combo preferences, keyed by combo_key. */
export function useComboPreferencesIndex(): Map<string, ComboPreference> {
  return useContext(PreferencesContext).comboByKey;
}

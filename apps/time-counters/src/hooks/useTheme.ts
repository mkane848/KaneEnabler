import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../types';
import { applyTheme, loadTheme, saveTheme } from '../utils/theme';

/**
 * Theme preference is a device/browser setting, not game state — it's stored
 * under its own localStorage key so resetting a game (New Game) never resets
 * it. index.html's inline script already applies the stored theme before
 * React mounts (avoiding a flash of the wrong theme); this hook re-derives
 * the same value for React state and re-applies on every change.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    saveTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}

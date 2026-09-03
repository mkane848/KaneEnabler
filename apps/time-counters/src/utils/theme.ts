import type { Theme } from '../types';

const KEY = 'mtg-time-tracker:theme:v1';

/**
 * The platform look is the default — this app should look like the rest of
 * the site until someone asks for the Doctor Who skin. See index.html's
 * inline script for the pre-hydration half of this.
 */
export const DEFAULT_THEME: Theme = 'platform';

export const THEME_LABEL: Record<Theme, string> = {
  who: 'Doctor Who',
  platform: 'Standard',
};

/** Mobile browser chrome color per theme, kept in sync with each theme's --color-bg. */
const THEME_COLOR: Record<Theme, string> = {
  who: '#071627',
  platform: '#17140f',
};

function isTheme(value: string | null): value is Theme {
  return value === 'platform' || value === 'who';
}

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (isTheme(stored)) return stored;
    // 'claude' was the pre-unification name for the non-Doctor-Who theme.
    // It's gone, but the platform theme is its descendant, so anyone who
    // had picked it wanted "not the Doctor Who skin" and still gets that.
    // Read-only on purpose: the value is rewritten on the next explicit
    // choice, and a migration write here would fight index.html's inline
    // script for which runs first.
    if (stored === 'claude') return 'platform';
    return DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private browsing / quota issues — the choice just won't persist.
  }
}

/** Applies a theme to the document — the DOM attribute the CSS keys off of, plus the mobile status-bar color. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

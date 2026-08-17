import type { Theme } from '../types';

const KEY = 'mtg-time-tracker:theme:v1';

/** Doctor Who is the default — see index.html's inline script for the pre-hydration half of this. */
export const DEFAULT_THEME: Theme = 'who';

export const THEME_LABEL: Record<Theme, string> = {
  who: 'Doctor Who',
  claude: 'Claude',
};

/** Mobile browser chrome color per theme, kept in sync with each theme's --color-bg. */
const THEME_COLOR: Record<Theme, string> = {
  who: '#071627',
  claude: '#14162b',
};

function isTheme(value: string | null): value is Theme {
  return value === 'claude' || value === 'who';
}

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, THEME_LABEL, applyTheme, loadTheme, saveTheme } from './theme';

const KEY = 'mtg-time-tracker:theme:v1';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color" content="" />';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadTheme', () => {
  it('defaults to the platform look, not the Doctor Who skin', () => {
    expect(DEFAULT_THEME).toBe('platform');
    expect(loadTheme()).toBe('platform');
  });

  it('round-trips an explicit choice', () => {
    saveTheme('who');
    expect(loadTheme()).toBe('who');
    saveTheme('platform');
    expect(loadTheme()).toBe('platform');
  });

  // 'claude' was the pre-unification name for the non-Doctor-Who theme.
  // Anyone who picked it wanted "not the skin", which is what the platform
  // theme now is — they must not be flipped into the skin on upgrade.
  it('migrates the retired "claude" preference to the platform theme', () => {
    localStorage.setItem(KEY, 'claude');
    expect(loadTheme()).toBe('platform');
  });

  it('falls back to the default for an unrecognized stored value', () => {
    localStorage.setItem(KEY, 'tardis');
    expect(loadTheme()).toBe('platform');
  });

  it('falls back to the default when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private browsing');
    });
    expect(loadTheme()).toBe('platform');
  });
});

describe('saveTheme', () => {
  it('swallows a storage failure rather than breaking the toggle', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveTheme('who')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('sets the attribute the CSS keys off of and the mobile chrome color', () => {
    applyTheme('who');
    expect(document.documentElement.getAttribute('data-theme')).toBe('who');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#071627',
    );

    applyTheme('platform');
    expect(document.documentElement.getAttribute('data-theme')).toBe('platform');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#17140f',
    );
  });
});

describe('THEME_LABEL', () => {
  it('names the skin after the show and the default after nothing in particular', () => {
    expect(THEME_LABEL.who).toBe('Doctor Who');
    expect(THEME_LABEL.platform).toBe('Standard');
  });
});

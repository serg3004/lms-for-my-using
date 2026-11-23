import { reapplyThemeSettings } from './theme.js';

/** PR 573: light / dark / follow the system. The choice lives in this browser only. */
export type ThemeMode = 'light' | 'dark' | 'system';

const storageKey = 'lms.themeMode';
const modes: readonly ThemeMode[] = ['light', 'dark', 'system'];

export function getStoredThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(storageKey);

    return modes.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
}

export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', resolveTheme(mode));
  reapplyThemeSettings();
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, mode);
  } catch {
    // The choice then lasts until the page is closed; the page still works.
  }
  applyThemeMode(mode);
  window.dispatchEvent(new Event('lms-theme-mode'));
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
}

/** Called once on start: applies the saved mode and follows the system while the mode is "system". */
export function initThemeMode() {
  applyThemeMode(getStoredThemeMode());

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredThemeMode() === 'system') applyThemeMode('system');
    });
  }
}

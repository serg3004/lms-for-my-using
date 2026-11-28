import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_MODES, getStoredThemeMode, resolveTheme, setThemeMode } from './themeMode.js';

function storageStub(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
    removeItem: vi.fn(() => { value = null; }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('theme mode', () => {
  it('lists the modes in the order of the theme menu', () => {
    expect(THEME_MODES).toEqual(['light', 'dark', 'system']);
  });

  it('reads the saved mode and falls back to system for anything else or without storage', () => {
    vi.stubGlobal('localStorage', storageStub('dark'));
    expect(getStoredThemeMode()).toBe('dark');
    vi.stubGlobal('localStorage', storageStub('purple'));
    expect(getStoredThemeMode()).toBe('system');
    vi.stubGlobal('localStorage', undefined);
    expect(getStoredThemeMode()).toBe('system');
  });

  it('resolves "system" from the browser preference', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(resolveTheme('system')).toBe('light');
  });

  it('saves a chosen mode, forgets the choice for "system", and sets the theme attribute', () => {
    const storage = storageStub();
    const setAttribute = vi.fn();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('document', { documentElement: { setAttribute, dataset: {}, style: { setProperty: vi.fn(), removeProperty: vi.fn() } } });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), dispatchEvent: vi.fn() });

    setThemeMode('dark');
    expect(storage.setItem).toHaveBeenCalledWith('lms.themeMode', 'dark');
    expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');

    setThemeMode('system');
    expect(storage.removeItem).toHaveBeenCalledWith('lms.themeMode');
    expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'light');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyThemeSettings,
  defaultThemeSettings,
  getStoredThemeSettings,
  resetThemeSettings,
  saveThemeSettings,
  themePresets,
} from './theme.js';

function storageStub(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
    removeItem: vi.fn(() => { value = null; }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme settings', () => {
  it('publishes immutable-looking default and preset choices', () => {
    expect(defaultThemeSettings.colorPrimary).toBe('#4f46e5');
    expect(themePresets.map(({ id }) => id)).toEqual(['default', 'emerald', 'slate']);
    expect(themePresets[1]?.settings.colorPrimary).toBe('#047857');
  });

  it('returns defaults without browser storage or a saved value', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getStoredThemeSettings()).toBe(defaultThemeSettings);

    vi.stubGlobal('localStorage', storageStub());
    expect(getStoredThemeSettings()).toBe(defaultThemeSettings);
  });

  it('normalizes partial and incorrectly typed saved settings', () => {
    vi.stubGlobal('localStorage', storageStub(JSON.stringify({ colorPrimary: '#000', radiusSm: 42 })));

    expect(getStoredThemeSettings()).toEqual({
      ...defaultThemeSettings,
      colorPrimary: '#000',
      radiusSm: defaultThemeSettings.radiusSm,
    });
  });

  it('falls back for invalid JSON and non-object JSON', () => {
    vi.stubGlobal('localStorage', storageStub('{broken'));
    expect(getStoredThemeSettings()).toBe(defaultThemeSettings);

    vi.stubGlobal('localStorage', storageStub('null'));
    expect(getStoredThemeSettings()).toBe(defaultThemeSettings);
  });

  it('applies every setting as a root custom property', () => {
    const setProperty = vi.fn();
    vi.stubGlobal('document', { documentElement: { style: { setProperty } } });

    applyThemeSettings(defaultThemeSettings);

    expect(setProperty).toHaveBeenCalledWith('--color-primary', '#4f46e5');
    expect(setProperty).toHaveBeenCalledWith('--admin-sidebar-text', '#ffffff');
    expect(setProperty).toHaveBeenCalledTimes(Object.keys(defaultThemeSettings).length);
  });

  it('does nothing when rendered outside a browser', () => {
    vi.stubGlobal('document', undefined);
    expect(() => applyThemeSettings(defaultThemeSettings)).not.toThrow();
  });

  it('persists, applies, and resets settings', () => {
    const localStorage = storageStub();
    const setProperty = vi.fn();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', { documentElement: { style: { setProperty } } });

    saveThemeSettings(defaultThemeSettings);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'lms.adminThemeSettings',
      JSON.stringify(defaultThemeSettings),
    );

    resetThemeSettings();
    expect(localStorage.removeItem).toHaveBeenCalledWith('lms.adminThemeSettings');
    expect(setProperty).toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('./apiClient.js', () => mocks);

import {
  applyThemeSettings,
  defaultThemeSettings,
  fetchOrganizationThemeSettings,
  getStoredThemeSettings,
  resetOrganizationThemeSettings,
  resetThemeSettings,
  saveOrganizationThemeSettings,
  saveThemeSettings,
  syncOrganizationTheme,
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
    // platformName/logoObjectKey/logoUrl aren't CSS custom properties.
    const nonCssPropertyKeys = ['platformName', 'logoObjectKey', 'logoUrl'];
    const expectedCssPropertyCount = Object.keys(defaultThemeSettings).filter((key) => !nonCssPropertyKeys.includes(key)).length;
    expect(setProperty).toHaveBeenCalledTimes(expectedCssPropertyCount);
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

describe('organization theme settings', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    vi.stubGlobal('localStorage', storageStub());
    vi.stubGlobal('document', { documentElement: { style: { setProperty: vi.fn() } } });
  });

  it('fetches and normalizes an organization theme', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ themeSettings: { colorPrimary: '#000000' } });

    await expect(fetchOrganizationThemeSettings('org-1')).resolves.toEqual({
      ...defaultThemeSettings,
      colorPrimary: '#000000',
    });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/organizations/org-1/theme');
  });

  it('falls back to defaults when the organization has no saved theme', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ themeSettings: null });

    await expect(fetchOrganizationThemeSettings('org-1')).resolves.toBe(defaultThemeSettings);
  });

  it('saves theme settings to the server and caches them locally', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ themeSettings: defaultThemeSettings });

    await expect(saveOrganizationThemeSettings('org-1', defaultThemeSettings)).resolves.toEqual(defaultThemeSettings);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/organizations/org-1/theme', {
      method: 'PATCH',
      body: JSON.stringify(defaultThemeSettings),
    });
    expect(getStoredThemeSettings()).toEqual(defaultThemeSettings);
  });

  it('resets theme settings on the server and clears the local cache', async () => {
    mocks.apiRequest.mockResolvedValueOnce(undefined);

    await expect(resetOrganizationThemeSettings('org-1')).resolves.toBe(defaultThemeSettings);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/organizations/org-1/theme', { method: 'DELETE' });
    expect(getStoredThemeSettings()).toBe(defaultThemeSettings);
  });

  it('dedupes sync calls for the same organization but re-fetches for a different one', async () => {
    mocks.apiRequest.mockResolvedValue({ themeSettings: null });

    await syncOrganizationTheme('org-dedupe');
    await syncOrganizationTheme('org-dedupe');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    await syncOrganizationTheme('org-other');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
  });

  it('allows a retry after a failed sync instead of caching the failure', async () => {
    mocks.apiRequest.mockRejectedValueOnce(new Error('network error'));
    mocks.apiRequest.mockResolvedValueOnce({ themeSettings: null });

    await syncOrganizationTheme('org-retry');
    await syncOrganizationTheme('org-retry');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
  });
});

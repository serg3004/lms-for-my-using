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
  uploadOrganizationThemeLogo,
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

  it('writes only customised settings and clears the ones left at their default', () => {
    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty, removeProperty } } });

    applyThemeSettings({ ...defaultThemeSettings, colorPrimary: '#047857', radiusLg: '18px' });

    expect(setProperty).toHaveBeenCalledWith('--color-primary', '#047857');
    // radiusLg 18px was the default before the refresh, so it follows the new default instead of being pinned.
    expect(removeProperty).toHaveBeenCalledWith('--radius-lg');
    expect(removeProperty).toHaveBeenCalledWith('--admin-sidebar-text');
    expect(setProperty).toHaveBeenCalledTimes(1);
  });

  it('keeps the dark tokens in the dark theme and lightens the brand colour', () => {
    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    vi.stubGlobal('document', { documentElement: { dataset: { theme: 'dark' }, style: { setProperty, removeProperty } } });

    applyThemeSettings({ ...defaultThemeSettings, colorPrimary: '#047857', colorBackground: '#f0fdf4' });

    expect(removeProperty).toHaveBeenCalledWith('--color-background');
    expect(setProperty).toHaveBeenCalledWith('--color-primary', 'color-mix(in srgb, #047857 60%, white)');
  });

  it('does nothing when rendered outside a browser', () => {
    vi.stubGlobal('document', undefined);
    expect(() => applyThemeSettings(defaultThemeSettings)).not.toThrow();
  });

  it('persists, applies, and resets settings', () => {
    const localStorage = storageStub();
    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty, removeProperty } } });

    saveThemeSettings(defaultThemeSettings);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'lms.adminThemeSettings',
      JSON.stringify(defaultThemeSettings),
    );

    resetThemeSettings();
    expect(localStorage.removeItem).toHaveBeenCalledWith('lms.adminThemeSettings');
    expect(removeProperty).toHaveBeenCalled();
  });
});

describe('organization theme settings', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    vi.stubGlobal('localStorage', storageStub());
    vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty: vi.fn(), removeProperty: vi.fn() } } });
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

  it('uploads a logo file and caches the returned theme settings locally', async () => {
    const saved = { ...defaultThemeSettings, logoObjectKey: 'organizations/org-1/branding/1', logoUrl: 'https://files.example.com/logo' };
    mocks.apiRequest.mockResolvedValueOnce({ themeSettings: saved });
    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });

    await expect(uploadOrganizationThemeLogo('org-1', file)).resolves.toEqual(saved);

    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    const [path, init] = mocks.apiRequest.mock.calls[0] as [string, { method: string; body: FormData }];
    expect(path).toBe('/organizations/org-1/logo');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBe(file);
    expect(getStoredThemeSettings()).toEqual(saved);
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

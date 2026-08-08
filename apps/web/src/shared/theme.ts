import { apiRequest } from './apiClient.js';

export type ThemeSettings = {
  colorPrimary: string;
  colorPrimaryHover: string;
  colorBackground: string;
  colorSurface: string;
  colorSurfaceMuted: string;
  colorBorder: string;
  colorText: string;
  colorTextMuted: string;
  shadowCard: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  spacePage: string;
  adminSidebarBackground: string;
  adminSidebarText: string;
  adminSidebarTextMuted: string;
  platformName: string;
  /** Server-managed S3 object key; set by uploadOrganizationLogo, round-tripped as-is. */
  logoObjectKey?: string;
  /** Server-resolved, short-lived display URL for logoObjectKey; not sent back on save. */
  logoUrl?: string;
};

export type ThemePreset = {
  id: string;
  label: string;
  settings: ThemeSettings;
};

const storageKey = 'lms.adminThemeSettings';

export const defaultThemeSettings: ThemeSettings = {
  colorPrimary: '#4f46e5',
  colorPrimaryHover: '#4338ca',
  colorBackground: '#f5f7fb',
  colorSurface: '#ffffff',
  colorSurfaceMuted: '#f8fafc',
  colorBorder: '#e3e8ef',
  colorText: '#172033',
  colorTextMuted: '#667085',
  shadowCard: '0 8px 24px rgb(23 32 51 / 5%)',
  radiusSm: '6px',
  radiusMd: '11px',
  radiusLg: '18px',
  spacePage: 'clamp(16px, 4vw, 48px)',
  adminSidebarBackground: '#111827',
  adminSidebarText: '#ffffff',
  adminSidebarTextMuted: '#cbd5e1',
  platformName: 'LearnSpace',
};

export const themePresets: ThemePreset[] = [
  {
    id: 'default',
    label: 'Default blue',
    settings: defaultThemeSettings,
  },
  {
    id: 'emerald',
    label: 'Emerald',
    settings: {
      ...defaultThemeSettings,
      colorPrimary: '#047857',
      colorPrimaryHover: '#065f46',
      colorBackground: '#f0fdf4',
      colorSurfaceMuted: '#dcfce7',
      colorBorder: '#bbf7d0',
      adminSidebarBackground: '#065f46',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    settings: {
      ...defaultThemeSettings,
      colorPrimary: '#334155',
      colorPrimaryHover: '#1e293b',
      colorBackground: '#f8fafc',
      colorSurfaceMuted: '#e2e8f0',
      colorBorder: '#cbd5e1',
    },
  },
];

type CssThemeKey = Exclude<keyof ThemeSettings, 'platformName' | 'logoObjectKey' | 'logoUrl'>;

const themeVariables: Record<CssThemeKey, string> = {
  colorPrimary: '--color-primary',
  colorPrimaryHover: '--color-primary-hover',
  colorBackground: '--color-background',
  colorSurface: '--color-surface',
  colorSurfaceMuted: '--color-surface-muted',
  colorBorder: '--color-border',
  colorText: '--color-text',
  colorTextMuted: '--color-text-muted',
  shadowCard: '--shadow-card',
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
  spacePage: '--space-page',
  adminSidebarBackground: '--admin-sidebar-background',
  adminSidebarText: '--admin-sidebar-text',
  adminSidebarTextMuted: '--admin-sidebar-text-muted',
};

function normalizeThemeSettings(value: unknown): ThemeSettings {
  if (!value || typeof value !== 'object') {
    return defaultThemeSettings;
  }

  const candidate = value as Partial<Record<keyof ThemeSettings, unknown>>;

  const settings = (Object.keys(themeVariables) as Array<CssThemeKey>).reduce<ThemeSettings>(
    (settings, key) => ({
      ...settings,
      [key]: typeof candidate[key] === 'string' ? candidate[key] : defaultThemeSettings[key],
    }),
    defaultThemeSettings,
  );

  return {
    ...settings,
    platformName: typeof candidate.platformName === 'string' ? candidate.platformName : defaultThemeSettings.platformName,
    logoObjectKey: typeof candidate.logoObjectKey === 'string' ? candidate.logoObjectKey : undefined,
    logoUrl: typeof candidate.logoUrl === 'string' ? candidate.logoUrl : undefined,
  };
}

export function applyThemeSettings(settings: ThemeSettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  (Object.entries(themeVariables) as Array<[CssThemeKey, string]>).forEach(([key, variable]) => {
    root.style.setProperty(variable, settings[key]);
  });
}

export function getStoredThemeSettings() {
  if (typeof localStorage === 'undefined') {
    return defaultThemeSettings;
  }

  const storedTheme = localStorage.getItem(storageKey);

  if (!storedTheme) {
    return defaultThemeSettings;
  }

  try {
    return normalizeThemeSettings(JSON.parse(storedTheme));
  } catch {
    return defaultThemeSettings;
  }
}

export function saveThemeSettings(settings: ThemeSettings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
  applyThemeSettings(settings);
}

export function resetThemeSettings() {
  localStorage.removeItem(storageKey);
  applyThemeSettings(defaultThemeSettings);
}

type OrganizationThemeResponse = { themeSettings: unknown };

export async function fetchOrganizationThemeSettings(organizationId: string): Promise<ThemeSettings> {
  const response = await apiRequest<OrganizationThemeResponse>(`/organizations/${organizationId}/theme`);

  return normalizeThemeSettings(response.themeSettings);
}

export async function saveOrganizationThemeSettings(organizationId: string, settings: ThemeSettings): Promise<ThemeSettings> {
  const response = await apiRequest<OrganizationThemeResponse>(`/organizations/${organizationId}/theme`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  const saved = normalizeThemeSettings(response.themeSettings);

  saveThemeSettings(saved);

  return saved;
}

export async function uploadOrganizationThemeLogo(organizationId: string, file: File): Promise<ThemeSettings> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiRequest<OrganizationThemeResponse>(`/organizations/${organizationId}/logo`, {
    method: 'POST',
    body: formData,
  });
  const saved = normalizeThemeSettings(response.themeSettings);

  saveThemeSettings(saved);

  return saved;
}

export async function resetOrganizationThemeSettings(organizationId: string): Promise<ThemeSettings> {
  await apiRequest(`/organizations/${organizationId}/theme`, { method: 'DELETE' });
  resetThemeSettings();

  return defaultThemeSettings;
}

let lastSyncedOrganizationId: string | null = null;

/**
 * Reconciles the cached (instant-on-boot) theme with the organization's saved
 * theme from the server. Deduped per organizationId so repeated calls (e.g. on
 * every protected-route navigation) don't re-fetch. Swallows errors — a stale
 * or default local theme is an acceptable fallback if the request fails.
 */
export async function syncOrganizationTheme(organizationId: string): Promise<void> {
  if (lastSyncedOrganizationId === organizationId) {
    return;
  }

  lastSyncedOrganizationId = organizationId;

  try {
    const settings = await fetchOrganizationThemeSettings(organizationId);

    saveThemeSettings(settings);
  } catch {
    lastSyncedOrganizationId = null;
  }
}

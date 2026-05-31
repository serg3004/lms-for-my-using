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
};

export type ThemePreset = {
  id: string;
  label: string;
  settings: ThemeSettings;
};

const storageKey = 'lms.adminThemeSettings';

export const defaultThemeSettings: ThemeSettings = {
  colorPrimary: '#2563eb',
  colorPrimaryHover: '#1d4ed8',
  colorBackground: '#f5f7fb',
  colorSurface: '#ffffff',
  colorSurfaceMuted: '#eef2f7',
  colorBorder: '#d8e0ec',
  colorText: '#172033',
  colorTextMuted: '#64748b',
  shadowCard: '0 10px 30px rgb(15 23 42 / 8%)',
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

const themeVariables: Record<keyof ThemeSettings, string> = {
  colorPrimary: '--color-primary',
  colorPrimaryHover: '--color-primary-hover',
  colorBackground: '--color-background',
  colorSurface: '--color-surface',
  colorSurfaceMuted: '--color-surface-muted',
  colorBorder: '--color-border',
  colorText: '--color-text',
  colorTextMuted: '--color-text-muted',
  shadowCard: '--shadow-card',
};

function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ThemeSettings, unknown>>;

  return Object.keys(themeVariables).every((key) => typeof candidate[key as keyof ThemeSettings] === 'string');
}

export function applyThemeSettings(settings: ThemeSettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  Object.entries(themeVariables).forEach(([key, variable]) => {
    root.style.setProperty(variable, settings[key as keyof ThemeSettings]);
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
    const parsedTheme = JSON.parse(storedTheme);

    return isThemeSettings(parsedTheme) ? parsedTheme : defaultThemeSettings;
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

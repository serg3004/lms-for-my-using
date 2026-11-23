import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getStoredThemeMode, nextThemeMode, setThemeMode, type ThemeMode } from './themeMode.js';

const icons: Record<ThemeMode, ReactNode> = {
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
};

/** One button that cycles light → dark → system; the icon and the label show the current choice. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode);

  useEffect(() => {
    const sync = () => setMode(getStoredThemeMode());
    window.addEventListener('lms-theme-mode', sync);

    return () => window.removeEventListener('lms-theme-mode', sync);
  }, []);

  const label = t('theme.switchLabel', { mode: t(`theme.${mode}`) });

  return (
    <button
      className="lang-switcher__btn theme-toggle"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setThemeMode(nextThemeMode(mode))}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icons[mode]}
      </svg>
    </button>
  );
}

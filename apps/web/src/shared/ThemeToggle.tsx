import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { THEME_MODES, getStoredThemeMode, resolveTheme, setThemeMode, type ThemeMode } from './themeMode.js';
import { Menu } from './ui.js';

const icons: Record<ThemeMode, ReactNode> = {
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  contrast: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
};

function Icon({ mode }: { mode: ThemeMode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[mode]}
    </svg>
  );
}

/**
 * PR 577: the theme menu of the header. The button shows the icon of the current choice; the menu lists every
 * theme by name with a check on the chosen one, and "same as device" says which theme the device gives now.
 */
export function ThemeToggle() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode);
  const [, refreshDevice] = useState(0);

  useEffect(() => {
    const sync = () => setMode(getStoredThemeMode());
    window.addEventListener('lms-theme-mode', sync);
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const device = () => refreshDevice((value) => value + 1);
    media?.addEventListener('change', device);

    return () => {
      window.removeEventListener('lms-theme-mode', sync);
      media?.removeEventListener('change', device);
    };
  }, []);

  const label = t('theme.switchLabel', { mode: t(`theme.${mode}`) });
  const applied = t('theme.appliedNow', { theme: t(`theme.${resolveTheme('system')}`).toLocaleLowerCase(i18n.language) });

  return (
    <Menu
      align="end"
      ariaLabel={label}
      buttonClassName="lang-switcher__btn theme-toggle"
      className="theme-menu"
      label={<Icon mode={mode} />}
    >
      <p className="ds-menu__hint theme-menu__title">{t('theme.menuLabel')}</p>
      {THEME_MODES.map((value) => (
        <button
          aria-checked={mode === value}
          className={`theme-menu__item${mode === value ? ' theme-menu__item--active' : ''}`}
          key={value}
          onClick={() => setThemeMode(value)}
          role="menuitemradio"
          type="button"
        >
          <Icon mode={value} />
          <span className="theme-menu__text">
            {t(`theme.${value}`)}
            {value === 'system' && <small>{applied}</small>}
          </span>
          <span aria-hidden="true" className="theme-menu__check">{mode === value ? '✓' : ''}</span>
        </button>
      ))}
    </Menu>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from './apiClient.js';
import { logout } from './logout.js';
import { Avatar, SkipLink } from './ui.js';
import { supportedLocales } from '../i18n/index.js';

export type LearnerNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type LearnerTopNavProps = {
  brandLabel: string;
  firstName?: string;
  lastName?: string;
  navItems?: LearnerNavItem[];
  onLogout: () => void;
};

export function LearnerTopNav({
  brandLabel,
  firstName,
  lastName,
  navItems = [],
  onLogout,
}: LearnerTopNavProps) {
  return (
    <header className="learner-topnav">
      <a className="learner-topnav__brand" href="/learn">
        {brandLabel}
      </a>

      {navItems.length > 0 ? (
        <nav aria-label="Main navigation" className="learner-topnav__nav">
          {navItems.map((item) => (
            <a
              aria-current={item.isCurrent ? 'page' : undefined}
              className="learner-topnav__link"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="learner-topnav__end">
        {firstName ? (
          <Avatar firstName={firstName} lastName={lastName} size="sm" />
        ) : null}
        <button className="learner-topnav__logout" type="button" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </header>
  );
}

type LearnerShellProps = {
  children: ReactNode;
};

export function LearnerShell({ children }: LearnerShellProps) {
  return <main className="learner-shell" id="main-content" tabIndex={-1}>{children}</main>;
}

/* ── Language switcher ───────────────────────────────────────────────────── */

const LANG_LABELS: Record<string, string> = { ru: 'RU', en: 'EN', kk: 'KK', zh: 'ZH' };

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANG_LABELS[i18n.language] ?? 'RU';

  return (
    <div className="lang-switcher">
      <button
        className="lang-switcher__btn"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current}
      </button>
      {open && (
        <div className="lang-switcher__menu">
          {supportedLocales.map((lang) => (
            <button
              key={lang}
              className={`lang-switcher__option${i18n.language === lang ? ' lang-switcher__option--active' : ''}`}
              type="button"
              onClick={() => { void i18n.changeLanguage(lang); setOpen(false); }}
            >
              {LANG_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── LearnerPageLayout ────────────────────────────────────────────────────── */

type UserState =
  | { status: 'loading' }
  | { status: 'loaded'; firstName: string; lastName?: string }
  | { status: 'error' };

const LEARNER_NAV_DEFS = [
  { key: 'nav.home', href: '/learn' },
  { key: 'courses.title', href: '/learn/courses' },
  { key: 'assignments.navLink', href: '/learn/assignments' },
  { key: 'assessments.navLink', href: '/learn/assessments' },
  { key: 'progress.navLink', href: '/learn/progress' },
  { key: 'certificates.navLink', href: '/learn/certificates' },
] as const;

type LearnerPageLayoutProps = {
  children: ReactNode;
  currentPath?: string;
};

export function LearnerPageLayout({ children, currentPath }: LearnerPageLayoutProps) {
  const { t } = useTranslation();
  const [userState, setUserState] = useState<UserState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const user = await getCurrentUser();
        if (isMounted) {
          setUserState({ status: 'loaded', firstName: user.firstName, lastName: user.lastName ?? undefined });
        }
      } catch {
        if (isMounted) setUserState({ status: 'error' });
      }
    }

    void loadUser();
    return () => { isMounted = false; };
  }, []);

  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');

  const firstName = userState.status === 'loaded' ? userState.firstName : undefined;
  const lastName = userState.status === 'loaded' ? userState.lastName : undefined;

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    window.location.href = '/login';
  }

  return (
    <div className="learner-app">
      <SkipLink label={t('a11y.skipToContent')} />
      <aside className="learner-sidebar">
        <div className="learner-sidebar__brand">
          <div className="learner-sidebar__mark">L</div>
          <div>
            <strong className="learner-sidebar__brand-name">LMS</strong>
            <span className="learner-sidebar__brand-sub">{t('nav.brandSub')}</span>
          </div>
        </div>

        <div className="learner-sidebar__section-label">{t('nav.sectionLabel')}</div>
        <nav className="learner-sidebar__nav" aria-label="Main navigation">
          {LEARNER_NAV_DEFS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`learner-sidebar__link${path === item.href || (item.href !== '/learn' && path.startsWith(item.href)) ? ' learner-sidebar__link--active' : ''}`}
              aria-current={path === item.href || (item.href !== '/learn' && path.startsWith(item.href)) ? 'page' : undefined}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>
      </aside>

      <div className="learner-content">
        <header className="learner-header">
          <div className="learner-header__end">
            <LanguageSwitcher />
            {firstName ? <Avatar firstName={firstName} lastName={lastName} size="sm" /> : null}
            <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="learner-shell" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

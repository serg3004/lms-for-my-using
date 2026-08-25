import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { LanguageSwitcher } from './learnerLayout.js';
import { logout } from './logout.js';
import { Avatar, SkipLink } from './ui.js';
import { useOptionalSession } from './session.js';

const MANAGER_NAV_DEFS = [
  { key: 'manager.navDashboard', href: '/manager/dashboard' },
  { key: 'manager.navTeam', href: '/manager/team' },
  { key: 'manager.navOverdue', href: '/manager/overdue' },
] as const;

type ManagerPageLayoutProps = {
  children: ReactNode;
  currentPath?: string;
};

export function ManagerPageLayout({ children, currentPath }: ManagerPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const currentUser = session?.currentUser;

  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');

  const firstName = currentUser?.firstName;
  const lastName = currentUser?.lastName ?? undefined;

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    session?.clearSession();
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
            <span className="learner-sidebar__brand-sub">{t('manager.brandSub')}</span>
          </div>
        </div>

        <nav className="learner-sidebar__nav" aria-label="Main navigation">
          {MANAGER_NAV_DEFS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`learner-sidebar__link${path.startsWith(item.href) ? ' learner-sidebar__link--active' : ''}`}
              aria-current={path.startsWith(item.href) ? 'page' : undefined}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>
      </aside>

      <div className="learner-content">
        <header className="learner-header">
          <div className="learner-header__end">
            <AccountSwitcher />
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

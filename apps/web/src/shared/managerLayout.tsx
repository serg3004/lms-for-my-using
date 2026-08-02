import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from './apiClient.js';
import { LanguageSwitcher } from './learnerLayout.js';
import { logout } from './logout.js';
import { Avatar } from './ui.js';

const MANAGER_NAV_DEFS = [
  { key: 'manager.navDashboard', href: '/manager/dashboard' },
  { key: 'manager.navTeam', href: '/manager/team' },
] as const;

type UserState =
  | { status: 'loading' }
  | { status: 'loaded'; firstName: string; lastName?: string }
  | { status: 'error' };

type ManagerPageLayoutProps = {
  children: ReactNode;
  currentPath?: string;
};

export function ManagerPageLayout({ children, currentPath }: ManagerPageLayoutProps) {
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
    return () => {
      isMounted = false;
    };
  }, []);

  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');

  const firstName = userState.status === 'loaded' ? userState.firstName : undefined;
  const lastName = userState.status === 'loaded' ? userState.lastName : undefined;

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    window.location.href = '/login';
  }

  return (
    <div className="learner-app">
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
            <LanguageSwitcher />
            {firstName ? <Avatar firstName={firstName} lastName={lastName} size="sm" /> : null}
            <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="learner-shell">{children}</main>
      </div>
    </div>
  );
}

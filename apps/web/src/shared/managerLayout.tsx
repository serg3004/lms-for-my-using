import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { LanguageSwitcher } from './learnerLayout.js';
import { logout } from './logout.js';
import { useOptionalSession } from './session.js';
import { WorkspaceLayout } from './workspaceLayout.js';

const MANAGER_NAV_DEFS = [
  { key: 'manager.navDashboard', href: '/manager/dashboard' },
  { key: 'manager.navTeam', href: '/manager/team' },
  { key: 'manager.navOverdue', href: '/manager/overdue' },
  { key: 'manager.navReports', href: '/manager/reports' },
  { key: 'manager.navChecklists', href: '/manager/checklists' },
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

  return <WorkspaceLayout
    brandHref="/manager/dashboard"
    roleLabel={t('admin.roles.options.manager', 'Manager')}
    contentMode="fluid"
    density="compact"
    firstName={firstName}
    lastName={lastName}
    email={currentUser?.email}
    navigation={MANAGER_NAV_DEFS.map((item) => ({ label: t(item.key), href: item.href, isCurrent: path.startsWith(item.href) }))}
    navigationLabel={t('a11y.mainNavigation', 'Main navigation')}
    breadcrumbLabel={t('a11y.breadcrumb', 'Breadcrumb')}
    openNavigationLabel={t('a11y.openNav', 'Open navigation')}
    closeNavigationLabel={t('a11y.closeNav', 'Close navigation')}
    skipLinkLabel={t('a11y.skipToContent')}
    accountActions={<>
      <AccountSwitcher />
      <LanguageSwitcher />
      <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>{t('nav.logout')}</button>
    </>}
  >{children}</WorkspaceLayout>;
}

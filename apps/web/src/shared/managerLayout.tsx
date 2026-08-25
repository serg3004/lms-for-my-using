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
    brandLabel="LMS"
    brandSubLabel={t('manager.brandSub')}
    contentMode="fluid"
    density="compact"
    firstName={firstName}
    lastName={lastName}
    navigation={MANAGER_NAV_DEFS.map((item) => ({ label: t(item.key), href: item.href, isCurrent: path.startsWith(item.href) }))}
    navigationLabel="Main navigation"
    skipLinkLabel={t('a11y.skipToContent')}
    headerActions={<div className="workspace-role-actions">
      <AccountSwitcher />
      <LanguageSwitcher />
      <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>{t('nav.logout')}</button>
    </div>}
  >{children}</WorkspaceLayout>;
}

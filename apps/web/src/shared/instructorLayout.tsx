import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { LanguageSwitcher } from './learnerLayout.js';
import { logout } from './logout.js';
import { useOptionalSession } from './session.js';
import { WorkspaceLayout, type WorkspaceNavItem } from './workspaceLayout.js';

type InstructorPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function InstructorPageLayout({ children, firstName, lastName }: InstructorPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const currentUser = session?.currentUser;
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const instructorNav = [
    { label: t('instructor.navDashboard'), href: '/instructor/dashboard' },
    { label: t('instructor.navCourses'), href: '/instructor/courses' },
    { label: t('instructor.navChecklists'), href: '/instructor/checklists' },
  ] as const;

  const navItems: WorkspaceNavItem[] = instructorNav.map((item) => ({
    ...item,
    isCurrent: path.startsWith(item.href),
  }));

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
    <WorkspaceLayout
        brandHref="/instructor/dashboard"
        brandLabel="LearnSpace"
        contentMode="dense"
        firstName={firstName ?? currentUser?.firstName}
        lastName={lastName ?? currentUser?.lastName ?? undefined}
        navigation={navItems}
        navigationLabel="Main navigation"
        skipLinkLabel={t('a11y.skipToContent')}
        variant="topbar"
        headerActions={<div className="workspace-role-actions">
          <AccountSwitcher /><LanguageSwitcher />
          <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>{t('nav.logout')}</button>
        </div>}
      >{children}</WorkspaceLayout>
  );
}

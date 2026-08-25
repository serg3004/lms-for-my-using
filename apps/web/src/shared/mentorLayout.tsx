import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { LanguageSwitcher } from './learnerLayout.js';
import { logout } from './logout.js';
import { useOptionalSession } from './session.js';
import { WorkspaceLayout, type WorkspaceNavItem } from './workspaceLayout.js';

type MentorPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function MentorPageLayout({ children, firstName, lastName }: MentorPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const currentUser = session?.currentUser;

  const navItems: WorkspaceNavItem[] = [
    { label: t('checklistReview.title', 'Checklist review'), href: '/mentor', isCurrent: true },
  ];

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
        brandHref="/mentor"
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

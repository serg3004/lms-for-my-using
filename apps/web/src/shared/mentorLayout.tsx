import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LearnerShell, LearnerTopNav, type LearnerNavItem } from './learnerLayout.js';
import { logout } from './logout.js';
import { SkipLink } from './ui.js';
import { useOptionalSession } from './session.js';

type MentorPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function MentorPageLayout({ children, firstName, lastName }: MentorPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const currentUser = session?.currentUser;

  const navItems: LearnerNavItem[] = [
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
    <>
      <SkipLink label={t('a11y.skipToContent')} />
      <LearnerTopNav
        brandLabel="LearnSpace"
        firstName={firstName ?? currentUser?.firstName}
        lastName={lastName ?? currentUser?.lastName ?? undefined}
        navItems={navItems}
        onLogout={() => { void handleLogout(); }}
        showAccountSwitcher
        showLanguageSwitcher
      />
      <LearnerShell>{children}</LearnerShell>
    </>
  );
}

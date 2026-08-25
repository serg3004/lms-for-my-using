import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LearnerShell, LearnerTopNav, type LearnerNavItem } from './learnerLayout.js';
import { logout } from './logout.js';
import { SkipLink } from './ui.js';
import { useOptionalSession } from './session.js';

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

  const navItems: LearnerNavItem[] = instructorNav.map((item) => ({
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

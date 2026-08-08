import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LearnerShell, LearnerTopNav, type LearnerNavItem } from './learnerLayout.js';
import { logout } from './logout.js';
import { SkipLink } from './ui.js';

type InstructorPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function InstructorPageLayout({ children, firstName, lastName }: InstructorPageLayoutProps) {
  const { t } = useTranslation();
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const instructorNav = [
    { label: t('instructor.navDashboard'), href: '/instructor/dashboard' },
    { label: t('instructor.navCourses'), href: '/instructor/courses' },
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
    window.location.href = '/login';
  }

  return (
    <>
      <SkipLink label={t('a11y.skipToContent')} />
      <LearnerTopNav
        brandLabel="LearnSpace"
        firstName={firstName}
        lastName={lastName}
        navItems={navItems}
        onLogout={() => { void handleLogout(); }}
        showAccountSwitcher
        showLanguageSwitcher
      />
      <LearnerShell>{children}</LearnerShell>
    </>
  );
}

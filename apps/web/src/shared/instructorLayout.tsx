import { type ReactNode } from 'react';

import { LearnerShell, LearnerTopNav, type LearnerNavItem } from './learnerLayout.js';

const INSTRUCTOR_NAV = [
  { label: 'Дашборд', href: '/instructor/dashboard' },
  { label: 'Курсы', href: '/instructor/courses' },
] as const;

type InstructorPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function InstructorPageLayout({ children, firstName, lastName }: InstructorPageLayoutProps) {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const navItems: LearnerNavItem[] = INSTRUCTOR_NAV.map((item) => ({
    ...item,
    isCurrent: path.startsWith(item.href),
  }));

  return (
    <>
      <LearnerTopNav
        brandLabel="LMS"
        firstName={firstName}
        lastName={lastName}
        navItems={navItems}
        onLogout={() => {
          window.location.href = '/login';
        }}
      />
      <LearnerShell>{children}</LearnerShell>
    </>
  );
}

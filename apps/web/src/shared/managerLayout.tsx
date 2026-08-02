import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LearnerShell, LearnerTopNav, type LearnerNavItem } from './learnerLayout.js';
import { SkipLink } from './ui.js';

const MANAGER_NAV = [
  { label: 'Дашборд', href: '/manager/dashboard' },
  { label: 'Команда', href: '/manager/team' },
] as const;

type ManagerPageLayoutProps = {
  children: ReactNode;
  firstName?: string;
  lastName?: string;
};

export function ManagerPageLayout({ children, firstName, lastName }: ManagerPageLayoutProps) {
  const { t } = useTranslation();
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const navItems: LearnerNavItem[] = MANAGER_NAV.map((item) => ({
    ...item,
    isCurrent: path.startsWith(item.href),
  }));

  return (
    <>
      <SkipLink label={t('a11y.skipToContent')} />
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

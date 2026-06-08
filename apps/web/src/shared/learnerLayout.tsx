import { useEffect, useState, type ReactNode } from 'react';

import { getCurrentUser } from './apiClient.js';
import { Avatar } from './ui.js';

export type LearnerNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type LearnerTopNavProps = {
  brandLabel: string;
  firstName?: string;
  lastName?: string;
  navItems?: LearnerNavItem[];
  onLogout: () => void;
};

export function LearnerTopNav({
  brandLabel,
  firstName,
  lastName,
  navItems = [],
  onLogout,
}: LearnerTopNavProps) {
  return (
    <header className="learner-topnav">
      <a className="learner-topnav__brand" href="/learn">
        {brandLabel}
      </a>

      {navItems.length > 0 ? (
        <nav aria-label="Main navigation" className="learner-topnav__nav">
          {navItems.map((item) => (
            <a
              aria-current={item.isCurrent ? 'page' : undefined}
              className="learner-topnav__link"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="learner-topnav__end">
        {firstName ? (
          <Avatar firstName={firstName} lastName={lastName} size="sm" />
        ) : null}
        <button className="learner-topnav__logout" type="button" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </header>
  );
}

type LearnerShellProps = {
  children: ReactNode;
};

export function LearnerShell({ children }: LearnerShellProps) {
  return <main className="learner-shell">{children}</main>;
}

/* ── LearnerPageLayout ────────────────────────────────────────────────────── */

type UserState =
  | { status: 'loading' }
  | { status: 'loaded'; firstName: string; lastName?: string }
  | { status: 'error' };

const LEARNER_NAV = [
  { label: 'Мои курсы', href: '/learn/courses' },
  { label: 'Назначения', href: '/learn/assignments' },
  { label: 'Прогресс', href: '/learn/progress' },
  { label: 'Сертификаты', href: '/learn/certificates' },
] as const;

type LearnerPageLayoutProps = {
  children: ReactNode;
  currentPath?: string;
};

export function LearnerPageLayout({ children, currentPath }: LearnerPageLayoutProps) {
  const [userState, setUserState] = useState<UserState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const user = await getCurrentUser();
        if (isMounted) {
          setUserState({
            status: 'loaded',
            firstName: user.firstName,
            lastName: user.lastName ?? undefined,
          });
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

  const navItems: LearnerNavItem[] = LEARNER_NAV.map((item) => ({
    ...item,
    isCurrent: path.startsWith(item.href),
  }));

  const firstName = userState.status === 'loaded' ? userState.firstName : undefined;
  const lastName = userState.status === 'loaded' ? userState.lastName : undefined;

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

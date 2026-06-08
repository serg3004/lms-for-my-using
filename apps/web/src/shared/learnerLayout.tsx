import type { ReactNode } from 'react';

import { Avatar } from './ui.js';

export type LearnerNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type LearnerTopNavProps = {
  brandLabel: string;
  firstName: string;
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
        <Avatar firstName={firstName} lastName={lastName} size="sm" />
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
  return <div className="learner-shell">{children}</div>;
}

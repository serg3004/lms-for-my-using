import type { ReactNode } from 'react';

import { Avatar, SkipLink } from './ui.js';

export type WorkspaceNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

export type WorkspaceContentMode = 'readable' | 'dense' | 'fluid';
export type WorkspaceDensity = 'comfortable' | 'compact';

type WorkspaceLayoutProps = {
  children: ReactNode;
  skipLinkLabel: string;
  brandLabel: string;
  brandHref: string;
  brandSubLabel?: string;
  navigation: WorkspaceNavItem[];
  navigationLabel: string;
  headerActions?: ReactNode;
  firstName?: string;
  lastName?: string;
  contentMode?: WorkspaceContentMode;
  density?: WorkspaceDensity;
  variant?: 'sidebar' | 'topbar';
  mobileNavigation?: ReactNode;
};

/** Shared, role-agnostic shell. Role layouts own policy and navigation data only. */
export function WorkspaceLayout({
  children,
  skipLinkLabel,
  brandLabel,
  brandHref,
  brandSubLabel,
  navigation,
  navigationLabel,
  headerActions,
  firstName,
  lastName,
  contentMode = 'readable',
  density = 'comfortable',
  variant = 'sidebar',
  mobileNavigation,
}: WorkspaceLayoutProps) {
  const accountActions = (
    <div className={variant === 'sidebar' ? 'learner-header__end' : 'learner-topnav__end'}>
      {headerActions}
      {firstName ? <Avatar firstName={firstName} lastName={lastName} size="sm" /> : null}
    </div>
  );
  const main = (
    <main
      className={`workspace-shell workspace-shell--${contentMode} workspace-shell--${density}`}
      id="main-content"
      tabIndex={-1}
    >
      {children}
    </main>
  );

  if (variant === 'topbar') {
    return (
      <div className="workspace-app workspace-app--topbar">
        <SkipLink label={skipLinkLabel} />
        <header className="learner-topnav">
          <a className="learner-topnav__brand" href={brandHref}>{brandLabel}</a>
          <nav aria-label={navigationLabel} className="learner-topnav__nav">
            {navigation.map((item) => (
              <a aria-current={item.isCurrent ? 'page' : undefined} className="learner-topnav__link" href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          {accountActions}
        </header>
        {main}
      </div>
    );
  }

  return (
    <div className="learner-app workspace-app workspace-app--sidebar">
      <SkipLink label={skipLinkLabel} />
      <aside className="learner-sidebar">
        <div className="learner-sidebar__brand">
          <div className="learner-sidebar__mark">L</div>
          <div>
            <strong className="learner-sidebar__brand-name">{brandLabel}</strong>
            {brandSubLabel ? <span className="learner-sidebar__brand-sub">{brandSubLabel}</span> : null}
          </div>
        </div>
        <nav className="learner-sidebar__nav" aria-label={navigationLabel}>
          {navigation.map((item) => (
            <a
              aria-current={item.isCurrent ? 'page' : undefined}
              className={`learner-sidebar__link${item.isCurrent ? ' learner-sidebar__link--active' : ''}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="learner-content">
        <header className="learner-header">{accountActions}</header>
        {main}
      </div>
      {mobileNavigation}
    </div>
  );
}

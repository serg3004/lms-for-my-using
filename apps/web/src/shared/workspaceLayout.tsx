import type { ReactNode } from 'react';

import { NavIcon, navIconForHref } from './navIcons.js';
import { useNavigationDrawer } from './navigationDrawer.js';
import { Avatar, SkipLink } from './ui.js';

export type WorkspaceNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

export type WorkspaceContentMode = 'readable' | 'dense' | 'fluid';
export type WorkspaceDensity = 'comfortable' | 'compact';

/** Brand shown by every workspace, same as the admin shell (UI refresh PR 310). */
export const WORKSPACE_BRAND_NAME = 'LearnSpace';

type WorkspaceLayoutProps = {
  children: ReactNode;
  skipLinkLabel: string;
  brandHref: string;
  /** Role name under the brand; also the first breadcrumb. */
  roleLabel: string;
  navigation: WorkspaceNavItem[];
  navigationLabel: string;
  breadcrumbLabel: string;
  openNavigationLabel: string;
  closeNavigationLabel: string;
  /** Always visible in the top bar (for example the notification bell). */
  headerActions?: ReactNode;
  /** Account switcher, language and logout: top bar on desktop, inside the drawer on mobile. */
  accountActions?: ReactNode;
  firstName?: string;
  lastName?: string;
  email?: string;
  contentMode?: WorkspaceContentMode;
  density?: WorkspaceDensity;
  mobileNavigation?: ReactNode;
};

/** Shared, role-agnostic shell. Role layouts own policy and navigation data only. */
export function WorkspaceLayout({
  children,
  skipLinkLabel,
  brandHref,
  roleLabel,
  navigation,
  navigationLabel,
  breadcrumbLabel,
  openNavigationLabel,
  closeNavigationLabel,
  headerActions,
  accountActions,
  firstName,
  lastName,
  email,
  contentMode = 'readable',
  density = 'comfortable',
  mobileNavigation,
}: WorkspaceLayoutProps) {
  const drawer = useNavigationDrawer('820px');
  const current = navigation.find((item) => item.isCurrent);

  return (
    <div className="learner-app workspace-app workspace-app--sidebar">
      <SkipLink label={skipLinkLabel} />
      {drawer.isOpen && <div aria-hidden="true" className="workspace-drawer-backdrop" onClick={drawer.close} />}
      <aside
        aria-label={navigationLabel}
        className={`learner-sidebar${drawer.isOpen ? ' learner-sidebar--open' : ''}`}
        ref={drawer.sidebarRef}
      >
        <div className="learner-sidebar__header">
          <a className="learner-sidebar__brand" href={brandHref}>
            <span className="learner-sidebar__mark">{WORKSPACE_BRAND_NAME[0]}</span>
            <span>
              <strong className="learner-sidebar__brand-name">{WORKSPACE_BRAND_NAME}</strong>
              <span className="learner-sidebar__brand-sub">{roleLabel}</span>
            </span>
          </a>
          <button
            aria-label={closeNavigationLabel}
            className="learner-sidebar__close"
            onClick={drawer.close}
            ref={drawer.closeButtonRef}
            type="button"
          >
            ✕
          </button>
        </div>
        <nav className="learner-sidebar__nav" aria-label={navigationLabel}>
          {navigation.map((item) => (
            <a
              aria-current={item.isCurrent ? 'page' : undefined}
              className={`learner-sidebar__link${item.isCurrent ? ' learner-sidebar__link--active' : ''}`}
              href={item.href}
              key={item.href}
            >
              <NavIcon name={navIconForHref(item.href)} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="learner-sidebar__footer">
          {firstName ? (
            <div className="learner-sidebar__user">
              <Avatar firstName={firstName} lastName={lastName} size="sm" />
              <div className="learner-sidebar__user-info">
                <div className="learner-sidebar__user-name">{[firstName, lastName].filter(Boolean).join(' ')}</div>
                {email ? <div className="learner-sidebar__user-email">{email}</div> : null}
              </div>
            </div>
          ) : null}
          {accountActions ? <div className="learner-sidebar__mobile-actions">{accountActions}</div> : null}
        </div>
      </aside>
      <div className="learner-content">
        <header className="learner-header">
          <button
            aria-expanded={drawer.isOpen}
            aria-label={openNavigationLabel}
            className="learner-header__menu"
            onClick={drawer.open}
            ref={drawer.menuButtonRef}
            type="button"
          >
            ☰
          </button>
          <nav aria-label={breadcrumbLabel} className="learner-breadcrumbs">
            <ol>
              <li>{current ? <span>{roleLabel}</span> : <span aria-current="page">{roleLabel}</span>}</li>
              {current ? (
                <li>
                  <span aria-current="page">{current.label}</span>
                </li>
              ) : null}
            </ol>
          </nav>
          <div className="learner-header__end">
            {headerActions}
            {accountActions ? <div className="learner-header__account">{accountActions}</div> : null}
          </div>
        </header>
        <main
          className={`workspace-shell workspace-shell--${contentMode} workspace-shell--${density}`}
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      {mobileNavigation}
    </div>
  );
}

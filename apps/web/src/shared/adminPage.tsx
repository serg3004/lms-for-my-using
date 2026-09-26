import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { LanguageSwitcher, NotificationBell } from './learnerLayout.js';
import { logout } from './logout.js';
import { NavIcon, navIconForHref } from './navIcons.js';
import { useNavigationDrawer } from './navigationDrawer.js';
import { useOptionalSession } from './session.js';
import { Avatar, SkipLink } from './ui.js';

const BRAND_NAME = 'LearnSpace';

export type AdminNavItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

type AdminSidebarNavItem = {
  label: string;
  href: string;
  /** Extra path prefixes (besides `href` itself) that should mark this sidebar link as active. */
  activePrefixes?: readonly string[];
};

type AdminSidebarSection = {
  label: string;
  items: readonly AdminSidebarNavItem[];
};

/** Routes grouped under the single "Organizational structure" sidebar entry and its in-page tabs. */
export const ORG_STRUCTURE_TAB_ROUTES = [
  '/admin/departments',
  '/admin/positions',
  '/admin/position-courses',
  '/admin/groups',
  '/admin/org-structure-tools',
] as const;

function getAdminNav(t: TFunction): readonly AdminSidebarSection[] {
  return [
    {
      label: t('admin.nav.managementSection', 'Management'),
      items: [
        { label: t('admin.nav.dashboard', 'Dashboard'), href: '/admin' },
        { label: t('admin.nav.courses', 'Courses'), href: '/admin/courses' },
        { label: t('admin.nav.lessons', 'Lessons'), href: '/admin/lessons' },
        { label: t('admin.nav.materials', 'Materials'), href: '/admin/materials' },
        { label: t('admin.nav.assessments', 'Assessments'), href: '/admin/assessments' },
        { label: t('admin.nav.checklists', 'Checklists'), href: '/admin/checklists' },
        { label: t('admin.nav.users', 'Users'), href: '/admin/users' },
        { label: t('admin.nav.assignments', 'Assignments'), href: '/admin/assignments' },
        { label: t('admin.nav.results', 'Results'), href: '/admin/results' },
      ],
    },
    {
      label: t('admin.nav.settingsSection', 'Settings'),
      items: [
        {
          label: t('admin.nav.orgStructure', 'Organizational structure'),
          href: ORG_STRUCTURE_TAB_ROUTES[0],
          activePrefixes: ORG_STRUCTURE_TAB_ROUTES,
        },
        { label: t('admin.nav.roles', 'Roles'), href: '/admin/roles' },
        { label: t('admin.nav.themeSettings', 'Theme settings'), href: '/admin/appearance' },
        { label: t('admin.nav.auditLog', 'Audit log'), href: '/admin/audit-log' },
      ],
    },
  ];
}

function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Active by route: the item's own route or any route nested under it (the dashboard only exactly). */
function isAdminItemActive(item: AdminSidebarNavItem, pathname: string): boolean {
  if (item.href === '/admin') return pathname === '/admin';
  return [item.href, ...(item.activePrefixes ?? [])].some((prefix) => matchesPath(pathname, prefix));
}

export type AdminBreadcrumb = { label: string; href?: string };

/** Third-level crumbs for routes nested under a sidebar entry, labelled from i18n rather than page props. */
function nestedAdminCrumbs(t: TFunction, pathname: string): AdminBreadcrumb[] {
  const orgTab = ORG_STRUCTURE_TABS.find((tab) => matchesPath(pathname, tab.href));
  if (orgTab) return [{ label: t(orgTab.labelKey, orgTab.fallback), href: orgTab.href }];
  if (pathname === '/admin/checklists/sessions') {
    return [{ label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' }];
  }
  if (pathname.startsWith('/admin/checklists/sessions/')) {
    return [
      { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' },
      { label: t('admin.checklists.report.eyebrow', 'Session report') },
    ];
  }
  return [];
}

/**
 * Breadcrumbs derived from the current route: sidebar section / sidebar entry / nested page. Pages
 * whose route is outside the sidebar fall back to their own `navItems`.
 */
export function buildAdminBreadcrumbs(t: TFunction, pathname: string, navItems: readonly AdminNavItem[]): AdminBreadcrumb[] {
  for (const section of getAdminNav(t)) {
    const item = section.items.find((candidate) => isAdminItemActive(candidate, pathname));
    if (!item) continue;
    const crumbs: AdminBreadcrumb[] = [{ label: section.label }, { label: item.label, href: item.href }];
    const nested = nestedAdminCrumbs(t, pathname);
    if (nested.length) return [...crumbs, ...nested];
    if (pathname !== item.href) {
      const page = navItems[navItems.length - 1];
      if (page && page.label !== item.label) crumbs.push({ label: page.label });
    }
    return crumbs;
  }
  return navItems.map((item) => ({ label: item.label, href: item.href }));
}

function fullName(user: { firstName: string; lastName?: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

type AdminPageLayoutProps = {
  brandLabel: string;
  sidebarLabel: string;
  navItems: readonly AdminNavItem[];
  currentUser?: { firstName: string; lastName?: string; email: string };
  /** Route used for active state and breadcrumbs; defaults to `window.location.pathname`. */
  currentPath?: string;
  children: ReactNode;
};

export function AdminPageLayout({
  brandLabel,
  sidebarLabel,
  navItems,
  currentUser: currentUserProp,
  currentPath,
  children,
}: AdminPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const drawer = useNavigationDrawer('860px');
  const currentUser = currentUserProp ?? session?.currentUser ?? undefined;

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    window.location.href = '/login';
  }

  const pathname = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const currentHrefs = new Set(navItems.filter((item) => item.isCurrent).map((item) => item.href));
  const isSidebarItemActive = (item: AdminSidebarNavItem) =>
    isAdminItemActive(item, pathname) || currentHrefs.has(item.href);
  const breadcrumbs = buildAdminBreadcrumbs(t, pathname, navItems);

  return (
    <div className="admin-layout">
      <SkipLink label={t('a11y.skipToContent')} />
      <div className="admin-mobile-bar">
        <button
          aria-expanded={drawer.isOpen}
          aria-label={t('a11y.openNav', 'Open navigation')}
          className="admin-hamburger"
          onClick={drawer.open}
          ref={drawer.menuButtonRef}
          type="button"
        >
          ☰
        </button>
        <span className="admin-mobile-brand">{BRAND_NAME}</span>
      </div>

      {drawer.isOpen && (
        <div
          aria-hidden="true"
          className="admin-drawer-backdrop"
          onClick={drawer.close}
        />
      )}

      <aside
        aria-label={sidebarLabel}
        className={`admin-sidebar${drawer.isOpen ? ' admin-sidebar--open' : ''}`}
        ref={drawer.sidebarRef}
      >
        <div className="admin-sidebar-header">
          <a className="admin-brand" href="/admin">
            <span className="admin-brand__logo">{BRAND_NAME[0]}</span>
            <span className="admin-brand__text">
              <span>{BRAND_NAME}</span>
              <span className="admin-brand__role">{brandLabel}</span>
            </span>
          </a>
          <button
            aria-label={t('a11y.closeNav', 'Close navigation')}
            className="admin-sidebar-close"
            onClick={drawer.close}
            ref={drawer.closeButtonRef}
            type="button"
          >
            ✕
          </button>
        </div>

        <nav className="admin-nav">
          {getAdminNav(t).map((section) => (
            <div className="admin-nav-section" key={section.label}>
              <div className="admin-nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <a
                  aria-current={isSidebarItemActive(item) ? 'page' : undefined}
                  className="admin-nav-link"
                  href={item.href}
                  key={item.href}
                >
                  <NavIcon name={navIconForHref(item.href)} />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          {currentUser ? (
            <div className="admin-sidebar-user">
              <Avatar firstName={currentUser.firstName} lastName={currentUser.lastName ?? undefined} size="sm" />
              <div className="admin-sidebar-user__info">
                <div className="admin-sidebar-user__name">{fullName(currentUser)}</div>
                <div className="admin-sidebar-user__email">{currentUser.email}</div>
              </div>
            </div>
          ) : null}
          <div className="admin-sidebar-footer__mobile-actions">
            <AccountSwitcher />
            <LanguageSwitcher />
            <button
              className="admin-sidebar-logout"
              onClick={() => { void handleLogout(); }}
              type="button"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <header className="admin-topheader">
        <nav aria-label={t('a11y.breadcrumb', 'Breadcrumb')} className="admin-breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`}>
                  {isLast ? (
                    <span aria-current="page">{crumb.label}</span>
                  ) : crumb.href ? (
                    <a href={crumb.href}>{crumb.label}</a>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="admin-topheader__actions">
          {/* PR 302 review fix: was a static, non-interactive bell emoji -- admins (the primary
              recipients of e.g. checklist_session_observer_unavailable) never saw an in-app alert
              for their own notifications unless they happened to visit a /learn route. */}
          <NotificationBell />
          <AccountSwitcher />
          <LanguageSwitcher />
          <button
            className="admin-topheader__logout"
            onClick={() => { void handleLogout(); }}
            type="button"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <main className="admin-shell" id="main-content" tabIndex={-1}>
        <div className="admin-shell__inner">{children}</div>
      </main>
    </div>
  );
}

// ── OrgStructureTabs ─────────────────────────────────────────────────────────

export type OrgStructureTabKey = 'departments' | 'positions' | 'positionCourses' | 'groups' | 'importHistory';

const ORG_STRUCTURE_TABS: readonly { key: OrgStructureTabKey; href: string; labelKey: string; fallback: string }[] = [
  { key: 'departments', href: '/admin/departments', labelKey: 'admin.nav.departments', fallback: 'Departments' },
  { key: 'positions', href: '/admin/positions', labelKey: 'admin.nav.positions', fallback: 'Positions' },
  { key: 'positionCourses', href: '/admin/position-courses', labelKey: 'admin.nav.positionCourses', fallback: 'Position courses' },
  { key: 'groups', href: '/admin/groups', labelKey: 'admin.nav.groups', fallback: 'Groups' },
  { key: 'importHistory', href: '/admin/org-structure-tools', labelKey: 'admin.nav.orgStructureTools', fallback: 'Import & history' },
];

/** In-page tab strip shared by the five pages that make up the "Organizational structure" section. */
export function OrgStructureTabs({ current }: { current: OrgStructureTabKey }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('admin.orgStructure.tabsLabel', 'Organizational structure sections')} className="admin-org-tabs">
      {ORG_STRUCTURE_TABS.map((tab) => (
        <a
          aria-current={tab.key === current ? 'page' : undefined}
          className="admin-org-tabs__tab"
          href={tab.href}
          key={tab.key}
        >
          {t(tab.labelKey, tab.fallback)}
        </a>
      ))}
    </nav>
  );
}

// ── ChecklistsTabs ───────────────────────────────────────────────────────────

export type ChecklistsTabKey = 'checklists' | 'sessions';

const CHECKLISTS_TABS: readonly { key: ChecklistsTabKey; href: string; labelKey: string; fallback: string }[] = [
  { key: 'checklists', href: '/admin/checklists', labelKey: 'admin.checklists.title', fallback: 'Checklists' },
  { key: 'sessions', href: '/admin/checklists/sessions', labelKey: 'admin.checklists.sessions.title', fallback: 'Sessions' },
];

/** In-page tab strip shared by the checklist builder and the workplace-training session screens. */
export function ChecklistsTabs({ current }: { current: ChecklistsTabKey }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('admin.checklists.tabsLabel', 'Checklist sections')} className="admin-org-tabs">
      {CHECKLISTS_TABS.map((tab) => (
        <a
          aria-current={tab.key === current ? 'page' : undefined}
          className="admin-org-tabs__tab"
          href={tab.href}
          key={tab.key}
        >
          {t(tab.labelKey, tab.fallback)}
        </a>
      ))}
    </nav>
  );
}

type AdminPageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function AdminPageHeader({ eyebrow, title, subtitle, action }: AdminPageHeaderProps) {
  return (
    <header className="admin-topbar">
      <div>
        {eyebrow ? <p className="admin-topbar__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

type AdminCardProps = {
  children: ReactNode;
};

export function AdminCard({ children }: AdminCardProps) {
  return <article className="admin-card">{children}</article>;
}

// ── FormField ─────────────────────────────────────────────────────────────────

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ id, label, required, hint, error, children }: FormFieldProps) {
  return (
    <div className="admin-form__field">
      <label htmlFor={id}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
      {hint && !error ? <span className="admin-form__hint">{hint}</span> : null}
      {error ? (
        <p className="admin-form__field-error" id={`${id}-error`} role="alert">{error}</p>
      ) : null}
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
};

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      ref.current?.showModal();
      confirmRef.current?.focus();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open]);

  function handleClose() {
    if (open) onCancel();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  return (
    <dialog aria-labelledby={titleId} className="admin-dialog" ref={ref} onClose={handleClose}>
      <div className="admin-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <button
          aria-label={cancelLabel}
          className="admin-dialog__close"
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
      </div>
      <div className="admin-form">
        <p style={{ margin: 0, color: 'var(--color-text)' }}>{message}</p>
        <div className="admin-form__actions">
          <button className="admin-btn admin-btn--secondary" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={`admin-btn ${variant === 'danger' ? 'admin-btn--danger' : 'admin-btn--primary'}`}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

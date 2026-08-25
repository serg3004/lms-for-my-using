import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { getUnreadNotificationCount, listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from './apiClient.js';
import type { NotificationSummary } from './apiClient.js';
import { logout } from './logout.js';
import { describeNotification, markAllReadLocally, markReadLocally, NOTIFICATION_COUNT_EVENT } from './notifications.js';
import { Avatar } from './ui.js';
import { supportedLocales } from '../i18n/index.js';
import { useOptionalSession } from './session.js';
import { WorkspaceLayout } from './workspaceLayout.js';

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
  showLanguageSwitcher?: boolean;
  showAccountSwitcher?: boolean;
};

export function LearnerTopNav({
  brandLabel,
  firstName,
  lastName,
  navItems = [],
  onLogout,
  showLanguageSwitcher = false,
  showAccountSwitcher = false,
}: LearnerTopNavProps) {
  const { t } = useTranslation();
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
        {showAccountSwitcher ? <AccountSwitcher /> : null}
        {showLanguageSwitcher ? <LanguageSwitcher /> : null}
        {firstName ? (
          <Avatar firstName={firstName} lastName={lastName} size="sm" />
        ) : null}
        <button className="learner-topnav__logout" type="button" onClick={onLogout}>
          {t('nav.logout')}
        </button>
      </div>
    </header>
  );
}

type LearnerShellProps = {
  children: ReactNode;
};

export function LearnerShell({ children }: LearnerShellProps) {
  return <main className="learner-shell" id="main-content" tabIndex={-1}>{children}</main>;
}

/* ── Language switcher ───────────────────────────────────────────────────── */

const LANG_LABELS: Record<string, string> = { ru: 'RU', en: 'EN', kk: 'KK', zh: 'ZH' };

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANG_LABELS[i18n.language] ?? 'RU';

  return (
    <div className="lang-switcher">
      <button
        className="lang-switcher__btn"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current}
      </button>
      {open && (
        <div className="lang-switcher__menu">
          {supportedLocales.map((lang) => (
            <button
              key={lang}
              className={`lang-switcher__option${i18n.language === lang ? ' lang-switcher__option--active' : ''}`}
              type="button"
              onClick={() => { void i18n.changeLanguage(lang); setOpen(false); }}
            >
              {LANG_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Notification bell ───────────────────────────────────────────────────── */

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getUnreadNotificationCount()
      .then((result) => { if (isMounted) setUnreadCount(result.count); })
      .catch(() => { /* unread badge is best-effort */ });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const syncCount = (event: Event) => setUnreadCount((event as CustomEvent<number>).detail);
    window.addEventListener(NOTIFICATION_COUNT_EVENT, syncCount);
    return () => window.removeEventListener(NOTIFICATION_COUNT_EVENT, syncCount);
  }, []);

  async function loadMenu() {
    setLoadError(false);
    setNotifications(null);
    try {
      setNotifications(await listNotifications());
    } catch {
      setLoadError(true);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      await loadMenu();
    }
  }

  async function handleNotificationClick(notification: NotificationSummary) {
    if (!notification.readAt) {
      try {
        await markNotificationAsRead(notification.id);
        setNotifications((current) => (current ? markReadLocally(current, notification.id) : current));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        /* navigation still proceeds even if marking as read failed */
      }
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsAsRead();
      setNotifications((current) => (current ? markAllReadLocally(current) : current));
      setUnreadCount(0);
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="notification-bell">
      <button
        className="notification-bell__btn"
        type="button"
        aria-expanded={open}
        aria-label={t('notifications.bell')}
        onClick={() => { void toggleOpen(); }}
      >
        🔔
        {unreadCount > 0 ? <span className="notification-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-bell__menu">
          <div className="notification-bell__header">
            <span>{t('notifications.bell')}</span>
            {notifications && notifications.some((item) => !item.readAt) ? (
              <button className="notification-bell__mark-all" type="button" onClick={() => { void handleMarkAllRead(); }}>
                {t('notifications.markAllRead')}
              </button>
            ) : null}
          </div>
          {loadError ? (
            <div className="notification-bell__empty" role="alert">
              <span>{t('notifications.loadError')}</span>
              <button className="notification-bell__retry" type="button" onClick={() => { void loadMenu(); }}>{t('notifications.retry')}</button>
            </div>
          ) : notifications === null ? (
            <div className="notification-bell__empty" role="status">{t('notifications.loading')}</div>
          ) : notifications.length === 0 ? (
            <div className="notification-bell__empty">{t('notifications.empty')}</div>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((notification) => {
                const { title, message } = describeNotification(notification, t);
                return (
                  <li key={notification.id}>
                    <button
                      className={`notification-bell__item${notification.readAt ? '' : ' notification-bell__item--unread'}`}
                      type="button"
                      onClick={() => { void handleNotificationClick(notification); }}
                    >
                      <span className="notification-bell__item-title">{title}</span>
                      <span className="notification-bell__item-message">{message}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <a className="notification-bell__all" href="/learn/notifications">{t('notifications.viewAll')}</a>
        </div>
      ) : null}
    </div>
  );
}

/* ── LearnerPageLayout ────────────────────────────────────────────────────── */

const LEARNER_NAV_DEFS = [
  { key: 'nav.home', href: '/learn' },
  { key: 'courses.title', href: '/learn/courses' },
  { key: 'assignments.navLink', href: '/learn/assignments' },
  { key: 'assessments.navLink', href: '/learn/assessments' },
  { key: 'checklists.navLink', href: '/learn/checklists' },
  { key: 'progress.navLink', href: '/learn/progress' },
  { key: 'certificates.navLink', href: '/learn/certificates' },
  { key: 'notifications.bell', href: '/learn/notifications' },
] as const;

const LEARNER_MOBILE_NAV_DEFS = [
  { key: 'nav.home', href: '/learn', icon: 'home' },
  { key: 'courses.title', href: '/learn/courses', icon: 'courses' },
  { key: 'notifications.bell', href: '/learn/notifications', icon: 'notifications' },
  { key: 'learner.profileTitle', href: '#learner-account-controls', icon: 'profile' },
] as const;

function MobileNavIcon({ icon }: { icon: (typeof LEARNER_MOBILE_NAV_DEFS)[number]['icon'] }) {
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />,
    courses: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Zm16 0A2.5 2.5 0 0 0 17.5 3H13v17h4.5a2.5 2.5 0 0 1 2.5 2V5.5Z" />,
    notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" />,
    profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
  };

  return <svg aria-hidden="true" className="learner-mobile-nav__icon" viewBox="0 0 24 24">{paths[icon]}</svg>;
}

type LearnerPageLayoutProps = {
  children: ReactNode;
  currentPath?: string;
};

export function LearnerPageLayout({ children, currentPath }: LearnerPageLayoutProps) {
  const { t } = useTranslation();
  const session = useOptionalSession();
  const currentUser = session?.currentUser;

  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');

  const firstName = currentUser?.firstName;
  const lastName = currentUser?.lastName ?? undefined;

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    session?.clearSession();
    window.location.href = '/login';
  }

  const mobileNavigation = (
    <nav className="learner-mobile-nav" aria-label={t('learner.mobileNavigation')}>
      {LEARNER_MOBILE_NAV_DEFS.map((item) => {
        const isCurrent = item.href.startsWith('/')
          && (path === item.href || (item.href !== '/learn' && path.startsWith(`${item.href}/`)));
        return (
          <a aria-current={isCurrent ? 'page' : undefined} className="learner-mobile-nav__link" href={item.href} key={item.href}>
            <MobileNavIcon icon={item.icon} />
            <span>{t(item.key)}</span>
          </a>
        );
      })}
    </nav>
  );

  return (
    <WorkspaceLayout
      brandHref="/learn"
      brandLabel="LMS"
      brandSubLabel={t('nav.brandSub')}
      contentMode="readable"
      firstName={firstName}
      lastName={lastName}
      mobileNavigation={mobileNavigation}
      navigation={LEARNER_NAV_DEFS.map((item) => ({
        href: item.href,
        label: t(item.key),
        isCurrent: path === item.href || (item.href !== '/learn' && path.startsWith(item.href)),
      }))}
      navigationLabel="Main navigation"
      skipLinkLabel={t('a11y.skipToContent')}
      headerActions={
        <div className="workspace-role-actions" id="learner-account-controls" tabIndex={-1}>
            <NotificationBell />
            <AccountSwitcher />
            <LanguageSwitcher />
            <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>
              {t('nav.logout')}
            </button>
        </div>
      }
    >
      {children}
    </WorkspaceLayout>
  );
}

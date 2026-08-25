import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountSwitcher } from './accountSwitcher.js';
import { getUnreadNotificationCount, listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from './apiClient.js';
import type { NotificationSummary } from './apiClient.js';
import { logout } from './logout.js';
import { describeNotification, markAllReadLocally, markReadLocally } from './notifications.js';
import { Avatar, SkipLink } from './ui.js';
import { supportedLocales } from '../i18n/index.js';
import { useOptionalSession } from './session.js';

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

  useEffect(() => {
    let isMounted = true;
    getUnreadNotificationCount()
      .then((result) => { if (isMounted) setUnreadCount(result.count); })
      .catch(() => { /* unread badge is best-effort */ });
    return () => { isMounted = false; };
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      try {
        setNotifications(await listNotifications());
      } catch {
        setNotifications([]);
      }
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
          {notifications === null ? (
            <div className="notification-bell__empty">…</div>
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
] as const;

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

  return (
    <div className="learner-app">
      <SkipLink label={t('a11y.skipToContent')} />
      <aside className="learner-sidebar">
        <div className="learner-sidebar__brand">
          <div className="learner-sidebar__mark">L</div>
          <div>
            <strong className="learner-sidebar__brand-name">LMS</strong>
            <span className="learner-sidebar__brand-sub">{t('nav.brandSub')}</span>
          </div>
        </div>

        <div className="learner-sidebar__section-label">{t('nav.sectionLabel')}</div>
        <nav className="learner-sidebar__nav" aria-label="Main navigation">
          {LEARNER_NAV_DEFS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`learner-sidebar__link${path === item.href || (item.href !== '/learn' && path.startsWith(item.href)) ? ' learner-sidebar__link--active' : ''}`}
              aria-current={path === item.href || (item.href !== '/learn' && path.startsWith(item.href)) ? 'page' : undefined}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>
      </aside>

      <div className="learner-content">
        <header className="learner-header">
          <div className="learner-header__end">
            <NotificationBell />
            <AccountSwitcher />
            <LanguageSwitcher />
            {firstName ? <Avatar firstName={firstName} lastName={lastName} size="sm" /> : null}
            <button className="learner-topnav__logout" type="button" onClick={() => { void handleLogout(); }}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="learner-shell" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

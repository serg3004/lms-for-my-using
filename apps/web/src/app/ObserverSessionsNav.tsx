import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useOptionalSession } from '../shared/session.js';

type SessionsNavUser = { roles: readonly string[] } | null | undefined;

/**
 * PR 360б: where an instructor or mentor manages every session of the organization. The widest role
 * wins for a combined role; null for anyone without the scheduling rights (their API calls would 403).
 */
export function allSessionsPath(user: SessionsNavUser): string | null {
  if (user?.roles.includes('instructor')) return '/instructor/checklists/sessions/all';
  if (user?.roles.includes('mentor')) return '/mentor/sessions';
  return null;
}

/** Where the same user conducts the sessions assigned to them. */
export function conductSessionsPath(user: SessionsNavUser): string {
  return user?.roles.includes('instructor') ? '/instructor/checklists/sessions' : '/mentor';
}

/** In-page tabs between "to conduct" and "all sessions" -- no new menu item (PR 360б). */
export function ObserverSessionsNav({ current }: { current: 'conduct' | 'all' }) {
  const { t } = useTranslation();
  const user = useOptionalSession()?.currentUser;
  const allPath = allSessionsPath(user);
  if (!allPath) return null;
  const tabs = [
    { key: 'conduct' as const, href: conductSessionsPath(user), label: t('checklistSessions.nav.conduct', 'To conduct') },
    { key: 'all' as const, href: allPath, label: t('checklistSessions.nav.all', 'All sessions') },
  ];
  return (
    <nav aria-label={t('checklistSessions.nav.label', 'Session sections')} className="admin-org-tabs">
      {tabs.map((tab) => (
        <Link aria-current={tab.key === current ? 'page' : undefined} className="admin-org-tabs__tab" key={tab.key} to={tab.href}>{tab.label}</Link>
      ))}
    </nav>
  );
}

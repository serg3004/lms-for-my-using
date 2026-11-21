import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { getUserLoginHistory, revokeAllUserSessions, revokeUserSession, type DeviceSession, type LoginEvent } from '../shared/api/auth.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { DeviceSessionList } from '../shared/DeviceSessionList.js';
import { formatDate } from '../shared/formatDate.js';

/** PR 494: an administrator reads a person's recent sign-ins and open sessions and can end them. */
export function AdminUserLoginsPage() {
  const { t } = useTranslation();
  const { userId = '' } = useParams();
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState<'load' | 'end' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.users.title', 'Users'), href: '/admin/users' },
    { label: t('security.journalTitle'), href: `/admin/users/${userId}/logins`, isCurrent: true },
  ];

  const load = useCallback(() => {
    getUserLoginHistory(userId).then((history) => { setEvents(history.events); setSessions(history.sessions); setError(null); }).catch(() => setError('load'));
  }, [userId]);
  useEffect(load, [load]);

  async function end(session: DeviceSession) {
    setBusyId(session.id);
    try {
      await revokeUserSession(userId, session.id);
      load();
    } catch {
      setError('end');
    } finally {
      setBusyId(null);
    }
  }

  async function endAll() {
    setBusyId('all');
    try {
      await revokeAllUserSessions(userId);
      load();
    } catch {
      setError('end');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader eyebrow={t('security.eyebrow')} title={t('security.journalTitle')} subtitle={t('security.journalSubtitle')} />
      {error ? <p className="admin-form__error" role="alert">{t(error === 'load' ? 'security.journalLoadError' : 'security.endSessionError')}</p> : null}
      <AdminCard>
        <div className="admin-form">
          <h2>{t('security.openSessions')}</h2>
          {events && sessions.length === 0 ? <p role="status">{t('security.noSessions')}</p> : null}
          <DeviceSessionList sessions={sessions} busyId={busyId} onRevoke={(session) => void end(session)} />
          {sessions.length > 0 ? (
            <div className="admin-form__actions">
              <button className="admin-btn admin-btn--danger" disabled={busyId === 'all'} onClick={() => void endAll()} type="button">{t('security.endAllSessions')}</button>
            </div>
          ) : null}
        </div>
      </AdminCard>
      <AdminCard>
        <div className="admin-form">
          <h2>{t('security.recentSignIns')}</h2>
          {events && events.length === 0 ? <p role="status">{t('security.noEvents')}</p> : null}
          <ul>
            {(events ?? []).map((event) => (
              <li key={event.id}>
                {formatDate(event.createdAt, undefined, { dateStyle: 'medium', timeStyle: 'short' })} — <strong>{t(`security.outcome.${event.outcome}`)}</strong>
                {event.deviceLabel ? `, ${event.deviceLabel}` : ''}{event.ipMasked ? `, ${event.ipMasked}` : ''}
              </li>
            ))}
          </ul>
        </div>
      </AdminCard>
    </AdminPageLayout>
  );
}

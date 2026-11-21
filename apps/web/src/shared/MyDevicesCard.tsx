import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listOwnSessions, logoutEverywhere, revokeOwnSession, type DeviceSession } from './api/auth.js';
import { DeviceSessionList } from './DeviceSessionList.js';

/** PR 494: "my devices" in the profile: where the person is signed in, end another session, or sign out everywhere. */
export function MyDevicesCard({ className = 'learner-profile__card' }: { className?: string }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<'load' | 'end' | 'all' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(() => {
    listOwnSessions().then((items) => { setSessions(items); setError(null); }).catch(() => setError('load'));
  }, []);
  useEffect(load, [load]);

  async function end(session: DeviceSession) {
    setBusyId(session.id);
    try {
      await revokeOwnSession(session.id);
      setSessions((current) => (current ?? []).filter((item) => item.id !== session.id));
      setError(null);
    } catch {
      setError('end');
    } finally {
      setBusyId(null);
    }
  }

  async function leaveEverywhere() {
    setLeaving(true);
    try {
      await logoutEverywhere();
      window.location.assign('/login');
    } catch {
      setError('all');
      setLeaving(false);
    }
  }

  return (
    <section className={className} aria-labelledby="my-devices-title">
      <h2 id="my-devices-title">{t('security.devicesTitle')}</h2>
      <p>{t('security.devicesHint')}</p>
      {error ? <p className="admin-form__error" role="alert">{t(error === 'load' ? 'security.devicesLoadError' : error === 'end' ? 'security.endSessionError' : 'security.logoutAllError')}</p> : null}
      {sessions ? <DeviceSessionList sessions={sessions} busyId={busyId} onRevoke={(session) => void end(session)} /> : null}
      <div className="admin-form__actions">
        <button className="admin-btn admin-btn--secondary" disabled={leaving} onClick={() => void leaveEverywhere()} type="button">{leaving ? t('security.leaving') : t('security.logoutAll')}</button>
      </div>
    </section>
  );
}

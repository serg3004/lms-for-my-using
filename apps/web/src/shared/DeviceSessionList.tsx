import { useTranslation } from 'react-i18next';

import type { DeviceSession } from './api/auth.js';
import { formatDate } from './formatDate.js';

const dateTime = { dateStyle: 'medium', timeStyle: 'short' } as const;

/** PR 494: a list of open sessions with the device, the cut address and the last activity; each one except the current can be ended. */
export function DeviceSessionList({ sessions, busyId, onRevoke }: { sessions: DeviceSession[]; busyId: string | null; onRevoke: (session: DeviceSession) => void }) {
  const { t } = useTranslation();
  return (
    <ul>
      {sessions.map((session) => (
        <li key={session.id}>
          <strong>{session.deviceLabel ?? t('security.unknownDevice')}</strong>
          {session.current ? ` (${t('security.thisDevice')})` : ''}
          {session.ipMasked ? `, ${session.ipMasked}` : ''} — {t('security.lastActive', { time: formatDate(session.lastActiveAt, undefined, dateTime) })}
          {session.current ? null : (
            <>{' '}<button className="admin-btn admin-btn--sm admin-btn--secondary" disabled={busyId === session.id} onClick={() => onRevoke(session)} type="button">{busyId === session.id ? t('security.endingSession') : t('security.endSession')}</button></>
          )}
        </li>
      ))}
    </ul>
  );
}

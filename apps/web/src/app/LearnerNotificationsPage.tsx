import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../shared/apiClient.js';
import type { NotificationSummary } from '../shared/apiClient.js';
import { describeNotification, markAllReadLocally, markReadLocally, NOTIFICATION_COUNT_EVENT } from '../shared/notifications.js';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; notifications: NotificationSummary[] };

function publishUnreadCount(count: number) {
  window.dispatchEvent(new CustomEvent<number>(NOTIFICATION_COUNT_EVENT, { detail: count }));
}

export function LearnerNotificationsPage() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [mutationError, setMutationError] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const notifications = await listNotifications();
      setState({ status: 'loaded', notifications });
      publishUnreadCount(notifications.filter((item) => !item.readAt).length);
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markOne(notification: NotificationSummary) {
    setMutationError(false);
    if (!notification.readAt) {
      try {
        await markNotificationAsRead(notification.id);
        setState((current) => {
          if (current.status !== 'loaded') return current;
          const notifications = markReadLocally(current.notifications, notification.id);
          publishUnreadCount(notifications.filter((item) => !item.readAt).length);
          return { status: 'loaded', notifications };
        });
      } catch {
        setMutationError(true);
        return;
      }
    }
    if (notification.link) window.location.href = notification.link;
  }

  async function markAll() {
    setMutationError(false);
    try {
      await markAllNotificationsAsRead();
      setState((current) => current.status === 'loaded'
        ? { status: 'loaded', notifications: markAllReadLocally(current.notifications) }
        : current);
      publishUnreadCount(0);
    } catch {
      setMutationError(true);
    }
  }

  return (
    <section className="notification-center" aria-labelledby="notification-center-title">
      <div className="notification-center__heading">
        <div>
          <h1 id="notification-center-title">{t('notifications.centerTitle')}</h1>
          <p>{t('notifications.centerSubtitle')}</p>
        </div>
        {state.status === 'loaded' && state.notifications.some((item) => !item.readAt) ? (
          <button className="notification-center__mark-all" type="button" onClick={() => { void markAll(); }}>
            {t('notifications.markAllRead')}
          </button>
        ) : null}
      </div>

      {mutationError ? <div className="notification-center__error" role="alert">{t('notifications.updateError')}</div> : null}
      {state.status === 'loading' ? <div className="notification-center__state" role="status">{t('notifications.loading')}</div> : null}
      {state.status === 'error' ? (
        <div className="notification-center__state" role="alert">
          <p>{t('notifications.loadError')}</p>
          <button type="button" onClick={() => { void load(); }}>{t('notifications.retry')}</button>
        </div>
      ) : null}
      {state.status === 'loaded' && state.notifications.length === 0 ? (
        <div className="notification-center__state">{t('notifications.empty')}</div>
      ) : null}
      {state.status === 'loaded' && state.notifications.length > 0 ? (
        <ul className="notification-center__list">
          {state.notifications.map((notification) => {
            const copy = describeNotification(notification, t);
            return (
              <li className={notification.readAt ? '' : 'notification-center__row--unread'} key={notification.id}>
                <button type="button" onClick={() => { void markOne(notification); }}>
                  <span className="notification-center__copy">
                    <strong>{copy.title}</strong>
                    <span>{copy.message}</span>
                    <time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.createdAt))}</time>
                  </span>
                  <span className="notification-center__status">{notification.readAt ? t('notifications.read') : t('notifications.unread')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

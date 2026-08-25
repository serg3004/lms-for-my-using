import type { TFunction } from 'i18next';

import type { NotificationSummary } from './api/types.js';

export const NOTIFICATION_COUNT_EVENT = 'lms:notification-count-changed';

/**
 * Notification content is stored server-side as { type, data } rather than pre-rendered text
 * (see backend buildAttemptResultNotification), so it can be rendered in the learner's own
 * locale here — the same i18n convention used for every other user-facing string in this app.
 */
export function describeNotification(notification: NotificationSummary, t: TFunction): { title: string; message: string } {
  return {
    title: t(`notifications.types.${notification.type}.title`, { defaultValue: notification.type }),
    message: t(`notifications.types.${notification.type}.message`, { ...notification.data, defaultValue: '' }),
  };
}

/** Optimistic local update after marking one notification read, without waiting for a refetch. */
export function markReadLocally(notifications: NotificationSummary[], notificationId: string, now: string = new Date().toISOString()): NotificationSummary[] {
  return notifications.map((item) => (item.id === notificationId ? { ...item, readAt: item.readAt ?? now } : item));
}

/** Optimistic local update after marking every notification read, without waiting for a refetch. */
export function markAllReadLocally(notifications: NotificationSummary[], now: string = new Date().toISOString()): NotificationSummary[] {
  return notifications.map((item) => ({ ...item, readAt: item.readAt ?? now }));
}

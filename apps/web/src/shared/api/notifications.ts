import { apiRequest } from '../apiClient.js';

import type { NotificationSummary } from './types.js';

const notificationsPath = '/notifications';

export function listNotifications() {
  return apiRequest<NotificationSummary[]>(notificationsPath);
}

export function getUnreadNotificationCount() {
  return apiRequest<{ count: number }>(`${notificationsPath}/unread-count`);
}

export function markNotificationAsRead(notificationId: string) {
  return apiRequest<NotificationSummary>(`${notificationsPath}/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsAsRead() {
  return apiRequest<{ ok: boolean }>(`${notificationsPath}/read-all`, { method: 'PATCH' });
}

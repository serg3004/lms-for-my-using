import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('../apiClient.js', () => mocks);

import { getUnreadNotificationCount, listNotifications, markAllNotificationsAsRead, markNotificationAsRead } from './notifications.js';

describe('notifications api', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
  });

  it('fetches the notification list', async () => {
    mocks.apiRequest.mockResolvedValueOnce([{ id: 'n1' }]);
    await expect(listNotifications()).resolves.toEqual([{ id: 'n1' }]);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/notifications');
  });

  it('fetches the unread count', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ count: 3 });
    await expect(getUnreadNotificationCount()).resolves.toEqual({ count: 3 });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/notifications/unread-count');
  });

  it('marks a single notification as read, encoding the id', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ id: 'n1', readAt: '2026-01-01T00:00:00.000Z' });
    await markNotificationAsRead('n 1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/notifications/n%201/read', { method: 'PATCH' });
  });

  it('marks all notifications as read', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ ok: true });
    await markAllNotificationsAsRead();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/notifications/read-all', { method: 'PATCH' });
  });
});

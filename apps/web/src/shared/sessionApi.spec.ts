import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('./apiClient.js', () => ({ apiRequest }));

import { confirmPasswordReset, getCurrentUser, login, requestPasswordReset, updateCurrentUserPreferences } from './api/auth.js';
import { getProgressSummary, listProgress } from './api/progress.js';
import { logout } from './logout.js';

afterEach(() => apiRequest.mockReset());

describe('session API wrappers', () => {
  it('posts the complete login input', async () => {
    apiRequest.mockResolvedValue({ accessToken: 'token' });
    const input = { organizationId: 'org', email: 'user@example.com', password: 'secret' };

    await login(input);

    expect(apiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('loads the current cookie-backed user', async () => {
    await getCurrentUser();
    expect(apiRequest).toHaveBeenCalledWith('/auth/me');
  });

  it('patches the current user locale preference', async () => {
    await updateCurrentUserPreferences({ locale: 'kk' });
    expect(apiRequest).toHaveBeenCalledWith('/auth/me/preferences', {
      method: 'PATCH', body: JSON.stringify({ locale: 'kk' }),
    });
  });

  it('posts password reset request and confirmation to the public auth contract', async () => {
    const request = { organizationId: '00000000-0000-4000-8000-000000000001', email: 'user@example.com' };
    const confirmation = { token: 'x'.repeat(43), password: 'NewPassword1!' };

    await requestPasswordReset(request);
    await confirmPasswordReset(confirmation);

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/auth/password-reset/request', { method: 'POST', body: JSON.stringify(request) });
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify(confirmation) });
  });

  it('posts logout and propagates failures', async () => {
    await logout();
    expect(apiRequest).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });

    apiRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(logout()).rejects.toThrow('offline');
  });

  it('lists progress with no query or encoded pagination', async () => {
    await listProgress();
    await listProgress({ page: 2, pageSize: 25 });

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/progress');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/progress?page=2&pageSize=25');
  });

  it.each([30, 90, 365] as const)('loads a %s-day progress summary', async (period) => {
    await getProgressSummary(period);
    expect(apiRequest).toHaveBeenCalledWith(`/progress/summary?period=${period}`);
  });
});

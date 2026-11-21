import type { Page } from '@playwright/test';

/** PR 494: "my devices" and the administrator's sign-in journal as a small in-memory fake. */
export const journalOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const journalUserId = 'abababab-abab-4aba-8aba-abababababab';

export type JournalCalls = { ownRevoked: string[]; userRevoked: string[]; revokedAll: number; loggedOutEverywhere: number };

export async function installLoginJournalMocks(page: Page, roles: string[] = ['learner']): Promise<JournalCalls> {
  const calls: JournalCalls = { ownRevoked: [], userRevoked: [], revokedAll: 0, loggedOutEverywhere: 0 };
  let own = [
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: '2030-01-01T09:00:00.000Z', lastActiveAt: '2030-01-01T10:00:00.000Z', current: true },
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', deviceLabel: 'Safari · iOS', ipMasked: null, createdAt: '2029-12-30T09:00:00.000Z', lastActiveAt: '2029-12-31T10:00:00.000Z', current: false },
  ];
  let watched = [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', deviceLabel: 'Firefox · Linux', ipMasked: '198.51.x.x', createdAt: '2030-01-01T09:00:00.000Z', lastActiveAt: '2030-01-01T10:00:00.000Z' }];
  const events = [
    { id: 'e1', outcome: 'success', deviceLabel: 'Firefox · Linux', ipMasked: '198.51.x.x', createdAt: '2030-01-01T09:00:00.000Z' },
    { id: 'e2', outcome: 'failed', deviceLabel: 'Chrome · Android', ipMasked: null, createdAt: '2029-12-31T09:00:00.000Z' },
  ];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: journalUserId, organizationId: journalOrgId, firstName: 'Айгуль', lastName: 'Сергеева', email: 'aigul@example.invalid', roles, locale: 'ru', timezone: 'UTC', status: 'active', position: 'Кладовщик' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path.endsWith('/password-policy')) return route.fulfill({ json: { minLength: 10, historyCount: 3 } });
    if (path === '/auth/me/profile') return route.fulfill({ json: { phone: null, locale: 'ru', timezone: 'Asia/Almaty', aboutMe: null, hasPhoto: false, version: 0 } });
    if (path === '/auth/me/sessions' && method === 'GET') return route.fulfill({ json: own });
    if (path.startsWith('/auth/me/sessions/') && method === 'DELETE') {
      const id = path.split('/')[4] ?? '';
      calls.ownRevoked.push(id);
      own = own.filter((session) => session.id !== id);
      return route.fulfill({ json: { revoked: true } });
    }
    if (path === '/auth/logout-all') { calls.loggedOutEverywhere += 1; return route.fulfill({ status: 201, json: { accepted: true } }); }
    if (path === `/users/${journalUserId}/login-history`) return route.fulfill({ json: { events, sessions: watched } });
    if (path.startsWith(`/users/${journalUserId}/sessions/`) && method === 'DELETE') {
      const id = path.split('/')[4] ?? '';
      calls.userRevoked.push(id);
      watched = watched.filter((session) => session.id !== id);
      return route.fulfill({ json: { revoked: 1 } });
    }
    if (path === `/users/${journalUserId}/sessions/revoke`) { calls.revokedAll += 1; watched = []; return route.fulfill({ status: 201, json: { revoked: 1 } }); }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

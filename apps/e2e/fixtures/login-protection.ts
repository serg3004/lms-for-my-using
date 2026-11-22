import type { Page } from '@playwright/test';

/** PR 493: the sign-in protection API as a small in-memory fake, so the security page is tested without a database. */
export const protectionOrgId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export type ProtectionCalls = { saved: Array<Record<string, number>>; unlocked: string[] };

export async function installLoginProtectionMocks(page: Page): Promise<ProtectionCalls> {
  const calls: ProtectionCalls = { saved: [], unlocked: [] };
  let locked = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', email: 'aigul@example.invalid', firstName: 'Айгуль', lastName: 'Сергеева', middleName: null, loginLockedUntil: '2030-01-01T10:30:00.000Z' },
  ];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: protectionOrgId, firstName: 'Админ', lastName: 'Системы', email: 'admin@example.invalid', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path.endsWith('/password-policy')) return route.fulfill({ json: { minLength: 10, historyCount: 3 } });
    if (path.endsWith('/login-protection')) {
      if (request.method() === 'PATCH') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, number>;
        calls.saved.push(body);
        return route.fulfill({ json: body });
      }
      return route.fulfill({ json: { maxFailures: 5, windowMinutes: 15, lockMinutes: 15, logRetentionDays: 90 } });
    }
    if (path === '/auth/me/profile') return route.fulfill({ json: { phone: null, locale: 'ru', timezone: 'Asia/Almaty', aboutMe: null, hasPhoto: false, version: 0 } });
    if (path === '/auth/me/sessions') return route.fulfill({ json: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: '2030-01-01T09:00:00.000Z', lastActiveAt: '2030-01-01T10:00:00.000Z', current: true }] });
    if (path === '/users/locked') return route.fulfill({ json: locked });
    if (path.endsWith('/unlock') && request.method() === 'POST') {
      const id = path.split('/')[2] ?? '';
      calls.unlocked.push(id);
      locked = locked.filter((user) => user.id !== id);
      return route.fulfill({ status: 201, json: { unlocked: true } });
    }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

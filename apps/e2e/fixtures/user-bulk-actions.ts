import type { Page } from '@playwright/test';

/** PR 497: the users list, the bulk impact and the bulk action as a small in-memory fake. */
export const bulkOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const adminId = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a1';

export type BulkCalls = { actions: Array<Record<string, unknown>>; impacts: Array<Record<string, unknown>>; counts: string[] };

const names = [['Айгуль', 'Сергеева'], ['Борис', 'Таков'], ['Виктор', 'Умаров']] as const;

export async function installUserBulkMocks(page: Page, roles: string[] = ['admin']): Promise<BulkCalls> {
  const calls: BulkCalls = { actions: [], impacts: [], counts: [] };
  const users = names.map(([firstName, lastName], index) => ({
    id: `c${index}c${index}c${index}c${index}-c${index}c${index}-4c${index}c-8c${index}c-c${index}c${index}c${index}c${index}c${index}c${index}c${index}c${index}c${index}c${index}c${index}c${index}`,
    organizationId: bulkOrgId, email: `u${index}@example.invalid`, firstName, lastName, middleName: null, position: null, shift: null, phone: null,
    status: 'active', locale: 'ru', timezone: 'UTC', lastLoginAt: '2030-01-01T09:00:00.000Z', createdAt: '2029-01-01T09:00:00.000Z', memberships: [{ role: 'learner' }],
  }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: adminId, organizationId: bulkOrgId, firstName: 'Админ', lastName: 'Главный', email: 'admin@example.invalid', roles, locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/users' && method === 'GET') {
      if (url.searchParams.get('pageSize') === '1') { calls.counts.push(url.search); return route.fulfill({ json: { items: [users[0]], total: 45, page: 1, pageSize: 1 } }); }
      return route.fulfill({ json: { items: users, total: 45, page: 1, pageSize: 20 } });
    }
    if (path === '/user-fields/for-users') return route.fulfill({ json: { items: [] } });
    if (path === '/users/invitations') return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    if (path === '/departments') return route.fulfill({ json: { items: [{ id: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', name: 'Склад' }], total: 1, page: 1, pageSize: 200 } });
    if (path === '/users/bulk-actions/impact') {
      calls.impacts.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 201, json: { users: 2, observerSessions: 1, soleInstructorCourses: 1, openAssignments: 5, subordinates: 0, managedDepartments: 0 } });
    }
    if (path === '/users/bulk-actions' && method === 'POST') {
      const body = request.postDataJSON() as { action: string; userIds?: string[] };
      calls.actions.push(body);
      const ids = body.userIds ?? [];
      const items = ids.map((userId, index) => index === 1 && body.action === 'suspend' ? { userId, status: 'conflict', reason: 'lastAdmin' } : { userId, status: 'done' });
      const done = items.filter((item) => item.status === 'done').length;
      return route.fulfill({ status: 201, json: { action: body.action, summary: { requested: ids.length, done, unchanged: 0, failed: ids.length - done }, items } });
    }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

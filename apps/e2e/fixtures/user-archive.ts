import type { Page } from '@playwright/test';

/** PR 495: the users list, the archiving impact and the status change as a small in-memory fake. */
export const archiveOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const archiveAdminId = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
export const archiveWorkerId = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

export type ArchiveCalls = { statusBodies: Array<Record<string, unknown>> };

export async function installUserArchiveMocks(page: Page, roles: string[] = ['admin']): Promise<ArchiveCalls> {
  const calls: ArchiveCalls = { statusBodies: [] };
  const worker = {
    id: archiveWorkerId, organizationId: archiveOrgId, email: 'worker@example.invalid', firstName: 'Айгуль', lastName: 'Сергеева', middleName: null, position: 'Кладовщик', shift: null, phone: null,
    status: 'active', locale: 'ru', timezone: 'UTC', lastLoginAt: '2030-01-01T09:00:00.000Z', createdAt: '2029-01-01T09:00:00.000Z', memberships: [{ role: 'learner' }],
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: archiveAdminId, organizationId: archiveOrgId, firstName: 'Админ', lastName: 'Главный', email: 'admin@example.invalid', roles, locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/users' && method === 'GET') return route.fulfill({ json: { items: [worker], total: 1, page: 1, pageSize: 20 } });
    if (path === '/users/invitations') return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    if (path === `/users/${archiveWorkerId}/status-impact`) {
      return route.fulfill({ json: { observerSessions: 2, soleInstructorCourses: [{ id: 'k1', title: 'Охрана труда' }], openAssignments: 3, subordinates: 0, managedDepartments: 0 } });
    }
    if (path === `/users/${archiveWorkerId}/status` && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.statusBodies.push(body);
      worker.status = body.status as string;
      return route.fulfill({ json: { ...worker } });
    }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

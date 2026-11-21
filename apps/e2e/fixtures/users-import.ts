import type { Page } from '@playwright/test';

/** PR 492: the import API as a small in-memory fake, so the page can be tested without a database. */
export const importOrgId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export type ImportCalls = { modes: string[]; sent: Array<Record<string, string>[]> };

export const importFileCsv = 'Почта,Фамилия,Имя,Подразделение,Роль\nanna@example.invalid,Иванова,Анна,Склад,Ученик\noleg@example.invalid,Петров,Олег,Нет такого,\nbroken,Сидорова,Вера,,\n';

export async function installUsersImportMocks(page: Page): Promise<ImportCalls> {
  const calls: ImportCalls = { modes: [], sent: [] };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: importOrgId, firstName: 'Админ', lastName: 'Системы', email: 'admin@example.invalid', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/users/import' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { mode: string; users: Record<string, string>[] };
      calls.modes.push(body.mode);
      calls.sent.push(body.users);
      const rows = body.users.map((user, index) => user.department === 'Нет такого'
        ? { index, email: user.email, status: 'skipped', userId: null, errors: ['Department not found'] }
        : { index, email: user.email, status: body.mode === 'create' ? 'created' : 'valid', userId: body.mode === 'create' ? `id-${index}` : null, errors: [], ...(body.mode === 'create' ? { invited: true, invitationDelivered: true } : {}) });
      return route.fulfill({ status: 201, json: { organizationId: importOrgId, mode: body.mode, totalRows: rows.length, createdCount: rows.filter((row) => row.status === 'created').length, skippedCount: rows.filter((row) => row.status === 'skipped').length, errorCount: rows.filter((row) => row.errors.length > 0).length, rows } });
    }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

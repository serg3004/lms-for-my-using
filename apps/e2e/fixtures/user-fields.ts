import type { Page } from '@playwright/test';

/** PR 500: the user fields API as a small in-memory fake for the settings page. */
const orgId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const labels = (ru: string, en: string) => ({ ru, en, kk: ru, zh: en });
type Field = { id: string; key: string; labels: ReturnType<typeof labels>; type: string; required: boolean; unique: boolean; searchable: boolean; options: null; visibleTo: string[]; editableBy: string[]; sortOrder: number; archived: boolean; valueCount: number };
const field = (key: string, ru: string, en: string, extra: Partial<Field> = {}): Field => ({ id: key, key, labels: labels(ru, en), type: 'text', required: false, unique: false, searchable: false, options: null, visibleTo: ['manager', 'self'], editableBy: [], sortOrder: 10, archived: false, valueCount: 0, ...extra });

export type UserFieldCalls = { created: Array<Record<string, unknown>>; archived: string[] };

export async function installUserFieldsMocks(page: Page): Promise<UserFieldCalls> {
  const calls: UserFieldCalls = { created: [], archived: [] };
  const fields = [
    field('employee_number', 'Табельный номер', 'Employee number', { unique: true, searchable: true, valueCount: 12 }),
    field('telegram', 'Telegram', 'Telegram', { type: 'phone', editableBy: ['self'], valueCount: 4 }),
    field('hired_at', 'Дата приёма', 'Hire date', { type: 'date', sortOrder: 20, valueCount: 9 }),
    field('work_schedule', 'График работы', 'Work schedule', { sortOrder: 30, valueCount: 7 }),
  ];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: orgId, firstName: 'Админ', lastName: 'Системы', email: 'admin@example.invalid', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/user-fields' && method === 'GET') return route.fulfill({ json: { items: fields.filter((item) => !item.archived || new URL(request.url()).searchParams.get('includeArchived') === 'true') } });
    if (path === '/user-fields' && method === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      calls.created.push(body);
      fields.push(field(String(body.key), String((body.labels as { ru: string }).ru), String((body.labels as { ru: string }).ru), { type: String(body.type) }));
      return route.fulfill({ status: 201, json: fields[fields.length - 1] });
    }
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}

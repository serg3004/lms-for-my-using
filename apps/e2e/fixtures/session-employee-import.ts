import type { Page } from '@playwright/test';

export const importEmployee = { id: '11111111-1111-4111-8111-111111111111', firstName: 'Alex', lastName: 'Employee', email: 'alex@example.test', position: null };
export const importObserver = { id: '22222222-2222-4222-8222-222222222222', firstName: 'Olga', lastName: 'Observer', email: 'olga@example.test', position: null };
export const importChecklistId = '33333333-3333-4333-8333-333333333333';
export const importRows = [
  { row: 2, email: importEmployee.email, status: 'ready', employee: importEmployee },
  { row: 3, email: 'outside@example.test', status: 'skipped', reason: 'outside_scope' },
  { row: 4, email: importEmployee.email, status: 'skipped', reason: 'duplicate' },
  { row: 5, email: '=2+2', status: 'skipped', reason: 'invalid_email' },
];
export async function installSessionImportMocks(page: Page, role: 'admin' | 'manager' | 'instructor' | 'mentor') {
  const writes: { path: string; data: string }[] = [];
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { ...importObserver, organizationId: 'test-org', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklists') return route.fulfill({ json: [{ id: importChecklistId, title: 'Import checklist', status: 'published', items: [], scoringMode: 'sum_points', scaleLevels: null }] });
    if (path === '/checklist-sessions/participants') {
      const isObserver = new URL(route.request().url()).searchParams.get('role') === 'observer';
      return route.fulfill({ json: { items: [isObserver ? importObserver : importEmployee], total: 1, page: 1, pageSize: 20 } });
    }
    if (path === '/checklist-sessions/import/preview') {
      writes.push({ path, data: route.request().postDataBuffer()?.toString('utf8') ?? '' });
      return route.fulfill({ json: { ready: 1, skipped: 3, rows: importRows } });
    }
    if (path === '/checklist-sessions/import') {
      writes.push({ path, data: route.request().postDataBuffer()?.toString('utf8') ?? '' });
      const rows = importRows.map((row) => row.status === 'ready' ? { ...row, status: 'created', sessionId: 'created-session' } : row);
      return route.fulfill({ json: { created: 1, skipped: 3, failed: 0, rows, results: [{ learnerId: importEmployee.id, sessionId: 'created-session', status: 'created' }] } });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  return writes;
}
export async function openSessionImport(page: Page, role: 'admin' | 'manager' | 'instructor' | 'mentor') {
  const writes = await installSessionImportMocks(page, role);
  await page.goto(role === 'instructor' ? '/instructor/checklists/sessions/all' : role === 'mentor' ? '/mentor/sessions' : '/admin/checklists/sessions');
  await page.getByRole('button', { name: 'Импорт списка', exact: true }).click();
  return writes;
}


export async function previewSessionImportPage(page: Page, role: 'admin' | 'manager' | 'instructor' | 'mentor') {
  const writes = await openSessionImport(page, role);
  const dialog = page.getByRole('dialog', { name: 'Импорт списка', exact: true });
  if (role !== 'instructor') await dialog.getByRole('radio', { name: /Olga Observer/ }).click();
  await dialog.getByLabel('Файл CSV или Excel', { exact: true }).setInputFiles({ name: 'employees.csv', mimeType: 'text/csv', buffer: Buffer.from('email\nalex@example.test\noutside@example.test\nalex@example.test\n=2+2') });
  await dialog.getByRole('button', { name: 'Проверить список', exact: true }).click();
  await dialog.getByRole('region', { name: 'Отчёт по строкам импорта' }).getByText('Принято: 1; пропущено: 3.', { exact: true }).waitFor();
  return writes;
}

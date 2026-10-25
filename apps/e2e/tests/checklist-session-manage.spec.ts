import { expect, test, type Page } from '@playwright/test';

const organizationId = '55555555-5555-4555-8555-555555555555';
const sessionId = '77777777-7777-4777-8777-777777777777';

function sessionRow() {
  return {
    id: sessionId, organizationId, instanceId: 'instance-1', observerId: 'observer-1', status: 'scheduled', version: 3,
    scheduledAt: '2026-03-08T07:30:00.000Z', durationMinutes: null, startedAt: null, pausedAt: null, locationCapturePolicy: 'off',
    timezone: 'America/New_York', overdue: false, strengths: null, developmentAreas: null, nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Safety training' },
    learner: { id: 'learner-1', firstName: 'Alex', lastName: 'Learner', email: 'alex@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
  };
}

// PR 333: delete, edit (time + observer in one PATCH) and "write to the participant" from the row menu.
async function openSessions(page: Page) {
  const calls = { deleted: 0, patched: null as Record<string, unknown> | null, messaged: null as Record<string, unknown> | null };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: '66666666-6666-4666-8666-666666666666', organizationId, email: 'admin@example.invalid',
      firstName: 'Test', lastName: 'Admin', middleName: null, position: null, shift: null, phone: null,
      status: 'active', locale: 'ru', timezone: 'America/New_York', roles: ['admin'],
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists' || path === '/departments') return route.fulfill({ json: path === '/departments' ? { items: [], page: 1, pageSize: 100, total: 0 } : [] });
    if (path === '/checklist-sessions/participants') {
      const items = [{ id: 'observer-2', firstName: 'Nina', lastName: 'Newobserver', email: 'nina@example.invalid', position: null }];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: 1 } });
    }
    if (path === `/checklist-sessions/${sessionId}/message` && request.method() === 'POST') {
      calls.messaged = request.postDataJSON();
      return route.fulfill({ status: 201, json: { sent: true } });
    }
    if (path === `/checklist-sessions/${sessionId}` && request.method() === 'DELETE') {
      calls.deleted++;
      return route.fulfill({ json: { deleted: true } });
    }
    if (path === `/checklist-sessions/${sessionId}` && request.method() === 'PATCH') {
      calls.patched = request.postDataJSON();
      return route.fulfill({ json: { ...sessionRow(), version: 4 } });
    }
    if (path === '/checklist-sessions') {
      const items = calls.deleted ? [] : [sessionRow()];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  await page.goto('/admin/checklists/sessions');
  await expect(page.getByText('Alex Learner').first()).toBeVisible();
  return calls;
}

test.describe('manage a scheduled session (PR 333)', () => {
  test.use({ timezoneId: 'America/New_York', viewport: { width: 1280, height: 900 } });

  test('writes to the participant with a trimmed text', async ({ page }) => {
    const calls = await openSessions(page);
    await page.getByRole('button', { name: 'Действия' }).first().click();
    await page.getByRole('menuitem', { name: 'Написать участнику' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Alex Learner');
    await expect(dialog.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    await dialog.getByLabel('Сообщение', { exact: true }).fill('  Возьмите бейдж  ');
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect.poll(() => calls.messaged).toEqual({ message: 'Возьмите бейдж' });
    await expect(page.getByRole('status')).toContainText('Сообщение отправлено.');
  });

  test('edits time and observer in a single PATCH carrying the version and timezone', async ({ page }) => {
    const calls = await openSessions(page);
    await page.getByRole('button', { name: 'Действия' }).first().click();
    await page.getByRole('menuitem', { name: 'Изменить время или наблюдателя' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    await dialog.getByLabel('Дата и время', { exact: true }).fill('2026-03-09T10:00');
    await dialog.getByRole('radio', { name: /Nina Newobserver/ }).check();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(() => calls.patched).toEqual({
      version: 3, scheduledAt: '2026-03-09T14:00:00.000Z', timezone: 'America/New_York', observerId: 'observer-2',
    });
  });

  test('deletes a not-started session after confirmation and refreshes the list', async ({ page }) => {
    const calls = await openSessions(page);
    await page.getByRole('button', { name: 'Действия' }).first().click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    const dialog = page.getByRole('dialog', { name: 'Удаление сессии' });
    await expect(dialog).toBeVisible();
    expect(calls.deleted).toBe(0);
    await dialog.getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(() => calls.deleted).toBe(1);
    await expect(page.getByText('Alex Learner')).toHaveCount(0);
  });
});

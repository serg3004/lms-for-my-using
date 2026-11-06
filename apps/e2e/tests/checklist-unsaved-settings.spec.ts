import { expect, test } from '@playwright/test';

// PR 417: settings typed in the editor are never lost on «Опубликовать» or on leaving the page.
test('Publish saves the typed title and description in the same request; leaving asks first', async ({ page }) => {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const state = { title: 'Открытие смены', description: null as string | null, status: 'draft' };
  const items = [{ id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: null }];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', ...state, scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: [], contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (request.method() === 'PATCH' && path === '/checklists/c1') {
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.push({ method: 'PATCH', path, body });
      Object.assign(state, { ...(typeof body.title === 'string' ? { title: body.title } : {}), ...('description' in body ? { description: body.description as string | null } : {}), ...(typeof body.status === 'string' ? { status: body.status } : {}) });
      return route.fulfill({ json: checklist() });
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();

  await page.locator('#checklist-title').fill('Открытие смены v2');
  await page.locator('#checklist-description').fill('Новое описание');
  await expect(page.getByText('Есть несохранённые изменения').first()).toBeVisible();

  // Leaving: «Остаться» keeps the editor and the typed text.
  await page.getByRole('button', { name: /Все чек-листы/ }).click();
  await expect(page.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeVisible();
  await page.getByRole('button', { name: 'Остаться', exact: true }).last().click();
  await expect(page.locator('#checklist-title')).toHaveText('Открытие смены v2');

  // Publish: one request carries the settings and the status.
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]!.body).toMatchObject({ title: 'Открытие смены v2', description: 'Новое описание', status: 'published' });
  await expect(page.locator('#checklist-title')).toHaveText('Открытие смены v2');
  await expect(page.getByTestId('checklist-unsaved-bar')).toHaveCount(0);
});

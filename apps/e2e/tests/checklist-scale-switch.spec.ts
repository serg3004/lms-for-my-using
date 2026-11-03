import { expect, test, type Page } from '@playwright/test';

// PR 414: a criterion's scale is a switch; the choice of the scale shows only when it is on.
type Server = { calls: { method: string; path: string; body: unknown }[]; failNext: number; groups: { id: string; checklistId: string; title: string; order: number }[]; contextFields: unknown[] | null };

async function openEditor(page: Page): Promise<Server> {
  const server: Server = {
    calls: [], failNext: 0, contextFields: null,
    groups: [
      { id: 'g1', checklistId: 'c1', title: 'Зал', order: 1 },
      { id: 'g2', checklistId: 'c1', title: 'Касса', order: 2 },
    ],
  };
  const items = [
    { id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g1', scaleId: null as string | null },
    { id: 'i2', checklistId: 'c1', order: 2, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g2', scaleId: 's1' as string | null },
  ];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: server.groups, contextFields: server.contextFields,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (method !== 'GET') {
      const body = request.postDataJSON() as Record<string, unknown>;
      server.calls.push({ method, path, body });
      if (server.failNext > 0) { server.failNext -= 1; return route.fulfill({ status: 500, json: { message: 'Сервер недоступен' } }); }
      if (/^\/checklist-item-groups\/[^/]+$/.test(path)) {
        const group = server.groups.find((entry) => path.endsWith(`/${entry.id}`))!;
        Object.assign(group, body);
        return route.fulfill({ json: group });
      }
      if (/^\/checklist-items\/[^/]+$/.test(path)) {
        const item = items.find((entry) => path.endsWith(`/${entry.id}`))!;
        Object.assign(item, body);
        return route.fulfill({ json: item });
      }
      if (path === '/checklists/c1') {
        if ('contextFields' in body) server.contextFields = body.contextFields as unknown[] | null;
        return route.fulfill({ json: checklist() });
      }
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: server.groups });
    if (path === '/checklist-scales') return route.fulfill({ json: [{ id: 's1', organizationId: 'org', name: 'Да/Нет', status: 'active', isDefault: true, levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 10 }] }] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();
  return server;
}

test.describe('Scale switch (PR 414)', () => {
  test('a criterion without a scale shows the switch off; turning it on saves the Yes/No scale and shows the choice', async ({ page }) => {
    const server = await openEditor(page);
    const light = page.getByRole('switch', { name: 'Шкала: Включить свет' });
    const cash = page.getByRole('switch', { name: 'Шкала: Проверить кассу' });
    await expect(light).not.toBeChecked();
    await expect(cash).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Шкала критерия: Включить свет' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Шкала критерия: Проверить кассу' })).toBeVisible();

    await light.check();
    await expect(page.getByRole('combobox', { name: 'Шкала критерия: Включить свет' })).toBeVisible();
    expect(server.calls.find((call) => call.path === '/checklist-items/i1')?.body).toEqual({ scaleId: 's1' });

    await cash.uncheck();
    await expect(page.getByRole('combobox', { name: 'Шкала критерия: Проверить кассу' })).toHaveCount(0);
    expect(server.calls.find((call) => call.path === '/checklist-items/i2')?.body).toEqual({ scaleId: null });
  });

  test('"Включить шкалу для всех критериев" and "Выключить шкалу у всех"', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByRole('button', { name: 'Включить шкалу для всех критериев' }).click();
    await expect(page.getByRole('switch', { name: 'Шкала: Включить свет' })).toBeChecked();
    expect(server.calls.filter((call) => call.path.startsWith('/checklist-items/'))).toHaveLength(1);
    await page.getByRole('button', { name: 'Выключить шкалу у всех' }).click();
    await expect(page.getByRole('switch', { name: 'Шкала: Включить свет' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Шкала: Проверить кассу' })).not.toBeChecked();
    expect(server.calls.filter((call) => call.path.startsWith('/checklist-items/') && (call.body as { scaleId: unknown }).scaleId === null)).toHaveLength(2);
  });

  test('a new criterion is created without a scale', async ({ page }) => {
    const server = await openEditor(page);
    await page.route('**/api/v1/checklists/c1/items', async (route) => {
      server.calls.push({ method: 'POST', path: '/checklists/c1/items', body: route.request().postDataJSON() });
      await route.fulfill({ json: { id: 'i3', checklistId: 'c1', order: 3, text: 'Новый критерий', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g1', scaleId: null } });
    });
    await page.getByRole('button', { name: '+ Критерий' }).first().click();
    await expect(page.getByRole('switch', { name: 'Шкала: Новый критерий' })).not.toBeChecked();
    expect((server.calls.find((call) => call.path === '/checklists/c1/items')?.body as { scaleId: unknown }).scaleId).toBeNull();
  });
});

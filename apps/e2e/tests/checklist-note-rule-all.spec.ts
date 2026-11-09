import { expect, test } from '@playwright/test';

// PR 457: "Apply to all criteria of the sheet with this scale" in the criterion window, with a confirmation.
test('the rule of one criterion is copied to the others with the same scale after a confirmation', async ({ page }) => {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const items = [
    { id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: 's1', noteRule: 'off', noteAnswers: null as string[] | null, noteRequired: false },
    { id: 'i2', checklistId: 'c1', order: 2, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: 's1', noteRule: 'off', noteAnswers: null as string[] | null, noteRequired: false },
    { id: 'i3', checklistId: 'c1', order: 3, text: 'Убрать зал', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: 's2', noteRule: 'off', noteAnswers: null as string[] | null, noteRequired: false },
  ];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: [], contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  const levels = [{ value: 1, label: 'Да', score: 10 }, { value: 2, label: 'Нет', score: 0 }];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (method !== 'GET') {
      calls.push({ method, path, body: request.postData() ? request.postDataJSON() : null });
      if (path === '/checklist-items/i1/apply-note-rule') return route.fulfill({ json: { updated: 1 } });
      if (/^\/checklist-items\/[^/]+$/.test(path)) {
        const item = items.find((entry) => path.endsWith(`/${entry.id}`))!;
        Object.assign(item, request.postDataJSON());
        return route.fulfill({ json: item });
      }
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [
      { id: 's1', organizationId: 'org', name: 'Да/Нет', status: 'active', isDefault: false, inUse: false, levels },
      { id: 's2', organizationId: 'org', name: 'Другая', status: 'active', isDefault: false, inUse: false, levels },
    ] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();

  await page.getByRole('button', { name: 'Действия' }).first().click();
  await page.getByRole('menuitem', { name: 'Описание и пояснение…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Критерий: описание и пояснение' });
  await dialog.getByRole('combobox').selectOption('on_answers');
  await dialog.getByLabel('Нет', { exact: true }).check();
  await dialog.getByLabel(/Пояснение обязательно/).check();
  await dialog.getByRole('button', { name: 'Применить ко всем критериям листа с этой шкалой' }).click();
  const confirm = page.getByRole('dialog', { name: 'Применить правило ко всем' });
  await expect(confirm).toContainText('Критериев с этой шкалой: 1');
  expect(calls.some((call) => call.path.endsWith('/apply-note-rule'))).toBe(false);
  await confirm.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Изменено критериев: 1');
  expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['PATCH /checklist-items/i1', 'POST /checklist-items/i1/apply-note-rule']);
  expect(calls[0]!.body).toMatchObject({ noteRule: 'on_answers', noteAnswers: ['2'], noteRequired: true });
});

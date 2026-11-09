import { expect, test, type Page } from '@playwright/test';

// PR 454: a refused save names the field and the reason instead of «Validation failed», marks the tab and leads to the field.
async function openEditor(page: Page, patchReply?: { status: number; json: unknown }) {
  const patches: unknown[] = [];
  const checklist = {
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [], itemGroups: [], contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (request.method() === 'PATCH' && path === '/checklists/c1') {
      patches.push(request.postDataJSON());
      return route.fulfill(patchReply ?? { json: checklist });
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist });
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.locator('#checklist-title')).toBeVisible();
  return patches;
}

test('a choice feedback field without an answer set: readable message, focus on «Набор ответов», no request', async ({ page }) => {
  const patches = await openEditor(page);
  const field = page.getByLabel('Название поля', { exact: true }).first();
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Опасности');
  await page.getByLabel('Тип поля').first().selectOption({ label: 'Выбор из набора ответов' });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  const alert = page.getByRole('alert').filter({ hasText: 'Опасности' });
  await expect(alert).toContainText('Поле «Опасности»: выберите набор ответов');
  await expect(page.getByText('Validation failed')).toHaveCount(0);
  await expect(page.getByLabel('Набор ответов').first()).toBeFocused();
  expect(patches).toHaveLength(0);
});

test('a server refusal names the field from the response details', async ({ page }) => {
  const reply = { status: 400, json: { statusCode: 400, path: '/api/v1/checklists/c1', timestamp: '2026-01-01T00:00:00.000Z', error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'passThreshold', message: 'Too big', code: 'too_big' }] } } };
  const patches = await openEditor(page, reply);
  await page.locator('#checklist-title').fill('Открытие смены v2');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => patches.length).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: 'Порог зачёта' })).toBeVisible();
  await expect(page.getByText('Validation failed')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Настройки/ })).toContainText('Настройки!');
});

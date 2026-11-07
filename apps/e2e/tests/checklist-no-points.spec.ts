import { expect, test } from '@playwright/test';
import { openSettingsTab } from '../fixtures/checklist-settings-tab.js';

// PR 416: the sheet mode "Без баллов" removes the pass threshold and says nothing is scored.
test('switching the sheet to "Без баллов" hides the pass threshold and shows the explanation', async ({ page }) => {
  const items = [
    { id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: null },
  ];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: [], contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();

  await openSettingsTab(page);
  await expect(page.getByLabel('Порог зачёта, %')).toBeVisible();
  await page.getByRole('button', { name: 'Без баллов' }).click();
  await expect(page.getByLabel('Порог зачёта, %')).toHaveCount(0);
  await expect(page.getByText('Без баллов: проверка просто завершается.')).toBeVisible();
  await expect(page.getByText('Пороги результата: как в организации')).toHaveCount(0);

  await page.getByRole('button', { name: 'Сумма баллов' }).click();
  await expect(page.getByLabel('Порог зачёта, %')).toBeVisible();
});

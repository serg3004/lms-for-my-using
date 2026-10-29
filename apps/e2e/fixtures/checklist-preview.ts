import { expect, type Page } from '@playwright/test';
import type { ChecklistSummary } from '../../web/src/shared/api/types.js';

// Synthetic 5S sheet: matches the reference's structure, contains no owner's personal data.
export function previewSheet(): ChecklistSummary {
  const checklistId = 'preview-sheet';
  const labels = ['Убрать лишние предметы', 'Проверить маркировку', 'Очистить оборудование', 'Проверить рабочие инструменты', 'Соблюдать порядок хранения'];
  return {
    id: checklistId, organizationId: 'preview-org', title: '5S — рабочее место', description: 'Учебный лист для проверки порядка и безопасности.',
    status: 'draft', scoringMode: 'sum_points', passThreshold: 70, scaleLevels: null, requiresReview: false,
    feedbackEnabled: true, feedbackRequired: false, allowSkipAll: false,
    createdBy: 'preview-admin', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    itemGroups: [
      { id: 'group-1', checklistId, title: 'Подготовка рабочего места', order: 0 },
      { id: 'group-2', checklistId, title: 'Порядок и безопасность', order: 1 },
    ],
    contextFields: [
      { id: 'notes', label: 'Условия наблюдения', type: 'textarea', order: 2, required: false },
      { id: 'place', label: 'Рабочее место', type: 'text', order: 0, required: true },
      { id: 'date', label: 'Дата наблюдения', type: 'date', order: 1, required: false },
    ],
    items: Array.from({ length: 27 }, (_, index) => ({
      id: `criterion-${index}`, checklistId, order: index, text: `${labels[index % labels.length]} (${index + 1})`,
      groupId: index < 14 ? 'group-1' : 'group-2', points: 3, weight: 1, isRequired: true,
      photoRequired: index === 0, allowSkip: index === 1,
      scale: index === 26 ? null : { id: 'preview-scale', name: 'Качество', levels: [
        { value: 0, label: 'Не выполнено', score: 0 }, { value: 1, label: 'Частично', score: 1 }, { value: 2, label: 'Выполнено', score: 3 },
      ] },
    })),
  };
}

export async function openPreviewBuilder(page: Page, sheet = previewSheet(), locale = 'ru') {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Read-only preview fixture' } });
    if (path === '/auth/me') return route.fulfill({ json: {
      id: 'preview-admin', organizationId: sheet.organizationId, email: 'admin@example.invalid', firstName: 'Preview', lastName: 'Admin',
      roles: ['admin'], status: 'active', locale, timezone: 'UTC',
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/checklists') return route.fulfill({ json: [sheet] });
    if (path === `/checklists/${sheet.id}`) return route.fulfill({ json: sheet });
    if (path.endsWith('/groups')) return route.fulfill({ json: sheet.itemGroups ?? [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: new RegExp(`${sheet.title}$`) }).click();
  // The builder link is shared across locales; use its translated name from the actual locale.
  const edit = { ru: 'Редактировать', en: 'Edit', kk: 'Өзгерту', zh: '编辑' }[locale]!;
  await page.getByRole('button', { name: edit, exact: true }).click();
  await expect(page.locator('.admin-builder')).toBeVisible();
  await expect(page.locator('.admin-criteria-row:not(.admin-criteria-row--head)')).toHaveCount(sheet.items.length);
  // Wait for the builder's read-only initialization before observing preview traffic.
  await page.waitForLoadState('networkidle');
}

export async function openSheetPreview(page: Page) {
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '5S — рабочее место', exact: true });
  await expect(dialog.getByRole('radiogroup')).toHaveCount(27);
  return dialog;
}

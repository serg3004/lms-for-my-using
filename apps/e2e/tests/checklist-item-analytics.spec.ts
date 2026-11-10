import { expect, test } from '@playwright/test';
import { installSheetAnalyticsMocks, sheetA, sheetB } from '../fixtures/checklist-sheet-analytics.js';

const goneSheet = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const librarySheet = (id: string, title: string) => ({
  id, organizationId: 'org', title, description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: 'admin', creator: null, createdAt: '2026-10-01T16:47:00.000Z', updatedAt: '2026-10-01T16:47:00.000Z',
  items: [{ id: `${id}-item`, checklistId: id, order: 1, text: 'Criterion', points: 10, isRequired: true, photoRequired: false }],
});

test('a checklist ticked in the library opens its analytics from the bulk bar', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'admin');
  await page.route('**/api/v1/checklists', (route) => route.fulfill({ json: [librarySheet(sheetA, 'Охрана труда'), librarySheet(sheetB, 'Складская приёмка')] }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/checklists');
  await page.getByRole('checkbox', { name: 'Выбрать чек-лист: Охрана труда' }).check();
  await page.getByRole('region', { name: 'Выбрано: 1' }).getByRole('button', { name: 'Аналитика' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/checklists/sheet-analytics\\?sheets=${sheetA}$`));
  await expect(page.getByTestId('item-analytics')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Критерии' }).getByText('Каски надеты')).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`one sheet: cuts, picking criteria with a recount and notes at ${width}px`, async ({ page }) => {
    const requests: URL[] = [];
    await installSheetAnalyticsMocks(page, 'admin', requests);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/checklists/sheet-analytics?sheets=${sheetA}`);
    const detail = page.getByTestId('item-analytics');
    await expect(detail.getByRole('heading', { name: /Охрана труда/ })).toBeVisible();
    // Criteria: the total over all three is 9 of 12 answered, average 7 of 9 points.
    await expect(detail.getByText('Итого по всем')).toBeVisible();
    await expect(detail.getByText('75%', { exact: true }).first()).toBeVisible();
    await expect(detail.getByText('78%', { exact: true }).first()).toBeVisible();
    // Picking only the last criterion recounts the total: 2 of 4 answered, average 1 of 2 points.
    await detail.getByRole('checkbox', { name: 'Учитывать: Каски надеты' }).click();
    await detail.getByRole('checkbox', { name: 'Учитывать: Проход свободен' }).click();
    await expect(page).toHaveURL(/pick=c3/);
    await expect(detail.getByText('Итого по отмеченным (1)')).toBeVisible();
    await expect(detail.getByText('50%', { exact: true }).first()).toBeVisible();
    await detail.getByRole('button', { name: 'Учитывать все' }).click();
    await expect(detail.getByText('Итого по всем')).toBeVisible();
    // Search by text narrows the table.
    await detail.getByLabel('Поиск по тексту').fill('огнетуш');
    await expect(detail.getByRole('table', { name: 'Критерии' }).getByText('Каски надеты')).toHaveCount(0);
    await detail.getByLabel('Поиск по тексту').fill('');
    // Groups, feedback and notes.
    await detail.getByRole('button', { name: 'Группы', exact: true }).click();
    await expect(page).toHaveURL(/cut=groups/);
    await expect(detail.getByRole('table', { name: 'Группы' }).getByText('Каски и проходы')).toBeVisible();
    await expect(detail.getByRole('table', { name: 'Группы' }).getByText('Без группы')).toBeVisible();
    await detail.getByRole('button', { name: 'Обратная связь', exact: true }).click();
    await expect(detail.getByTestId('item-analytics-feedback').filter({ hasText: 'Настроение смены' }).getByText('Хорошее')).toBeVisible();
    await expect(detail.getByTestId('item-analytics-feedback').filter({ hasText: 'Сильные стороны' })).toContainText('Не заполнено: 2');
    await detail.getByRole('button', { name: 'Примечания', exact: true }).click();
    await expect(detail.getByTestId('item-analytics-notes').getByText('Одна каска без ремня')).toBeVisible();
    await detail.getByLabel('Критерий').selectOption('c2');
    await expect(detail.getByTestId('item-analytics-notes').getByText('Коробки у выхода')).toBeVisible();
    await expect(detail.getByTestId('item-analytics-notes').getByText('Одна каска без ремня')).toHaveCount(0);
    await expect(detail.getByRole('link', { name: 'Отчёт сессии' })).toHaveAttribute('href', '/admin/checklists/sessions/s-c2');
    expect(requests.some((url) => url.searchParams.get('by') === 'notes' && url.searchParams.get('itemId') === 'c2')).toBe(true);
    // A reload keeps the cut and the chosen criterion.
    await page.reload();
    await expect(detail.getByTestId('item-analytics-notes').getByText('Коробки у выхода')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('main')).not.toContainText(/null|undefined|NaN/);
  });
}

test('a sheet without groups and feedback hides those cuts', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'admin');
  await page.goto(`/admin/checklists/sheet-analytics?sheets=${sheetB}`);
  const detail = page.getByTestId('item-analytics');
  await expect(detail.getByRole('button', { name: 'Критерии', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Примечания', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Группы', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Обратная связь', exact: true })).toHaveCount(0);
});

test('a deleted or unavailable sheet says so', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'admin');
  await page.goto(`/admin/checklists/sheet-analytics?sheets=${goneSheet}`);
  await expect(page.getByText('Этот чек-лист удалён или недоступен вам.')).toBeVisible();
});

test('a sheet without sessions in the period says so', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'admin');
  await page.route(/\/api\/v1\/checklists\/[^/]+\/analytics\/items/, (route) => route.fulfill({ json: { by: 'criteria', instances: 0, criteria: [], groups: [], feedback: [], period: { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, truncated: false } }));
  await page.goto(`/admin/checklists/sheet-analytics?sheets=${sheetA}`);
  await expect(page.getByText('По этому чек-листу за период ещё нет сессий.')).toBeVisible();
});

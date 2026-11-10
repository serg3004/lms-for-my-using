import { expect, test } from '@playwright/test';
import { installSheetAnalyticsMocks, sheetA, sheetB } from '../fixtures/checklist-sheet-analytics.js';

for (const width of [390, 1440]) {
  test(`admin opens the Analytics tab next to Sessions and Evaluation scales and picks sheets at ${width}px`, async ({ page }) => {
    const requests = await installSheetAnalyticsMocks(page, 'admin');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/checklists/sessions');
    const tabs = page.getByRole('navigation', { name: 'Разделы чек-листов' });
    await expect(tabs.getByRole('link', { name: 'Сессии', exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Оценочные шкалы', exact: true })).toBeVisible();
    await tabs.getByRole('link', { name: 'Аналитика', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/checklists\/sheet-analytics$/);
    await expect(tabs.getByRole('link', { name: 'Аналитика', exact: true })).toHaveAttribute('aria-current', 'page');
    // All accessible sheets: completion, the sheet scale levels by their own names, plan/fact and the table.
    await expect(page.getByText('67%', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('sheet-analytics-scale').filter({ hasText: 'Освоение' }).getByText('Не знает')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Показатели по чек-листам' }).getByText('Охрана труда')).toBeVisible();
    expect(requests.at(-1)?.searchParams.get('checklistIds')).toBeNull();
    // Switching one sheet off keeps the choice in the address bar and reloads the metrics for the rest only.
    await page.getByTestId('sheet-analytics-picker').getByLabel(/Охрана труда/).click();
    await expect(page).toHaveURL(new RegExp(`sheets=${sheetB}$|sheets=${sheetB}&`));
    await expect(page.getByRole('table', { name: 'Показатели по чек-листам' }).getByText('Охрана труда')).toHaveCount(0);
    expect(requests.at(-1)?.searchParams.get('checklistIds')).toBe(sheetB);
    await page.reload();
    await expect(page.getByTestId('sheet-analytics-picker').getByLabel(/Охрана труда/)).not.toBeChecked();
    await page.getByLabel('Все доступные', { exact: false }).click();
    await expect(page).not.toHaveURL(/sheets=/);
    // The page never overflows sideways and no placeholder text leaks.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('main')).not.toContainText(/null|undefined|NaN/);
  });
}

test('instructor gets the checklist analytics tab and the old employee analytics stay as they were', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'instructor');
  await page.goto('/instructor/checklists/analytics');
  const tabs = page.getByRole('navigation', { name: 'Разделы сессий' });
  await expect(tabs.getByRole('link', { name: 'Аналитика', exact: true })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Аналитика листов', exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/checklists\/sheet-analytics$/);
  await expect(page.getByRole('table', { name: 'Показатели по чек-листам' }).getByText('Складская приёмка')).toBeVisible();
});

test('manager switches between employees and checklists on the analytics page', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'manager');
  await page.goto('/manager/checklists');
  const switcher = page.getByRole('navigation', { name: 'Вид аналитики' });
  await expect(switcher.getByRole('link', { name: 'Сотрудники', exact: true })).toHaveAttribute('aria-current', 'page');
  await switcher.getByRole('link', { name: 'Чек-листы', exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/checklists\/sheets$/);
  await expect(page.getByRole('table', { name: 'Показатели по чек-листам' }).getByText('Охрана труда')).toBeVisible();
  await switcher.getByRole('link', { name: 'Сотрудники', exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/checklists$/);
});

test('a period without sessions says so instead of showing empty cards', async ({ page }) => {
  await installSheetAnalyticsMocks(page, 'admin');
  await page.route('**/api/v1/checklists/analytics/overview**', (route) => route.fulfill({ json: { total: { plan: { planned: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, remaining: 0 }, completionPercentage: null, selfCompleted: 0, averagePercentage: null, criteria: { total: 0, answered: 0, skipped: 0, remaining: 0, zeroPoints: 0 }, scales: [], queue: { notStarted: 0, oldestDays: null } }, sheets: [{ checklistId: sheetA, title: 'Охрана труда', plan: { planned: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, remaining: 0 }, completionPercentage: null, selfCompleted: 0, averagePercentage: null, criteria: { total: 0, answered: 0, skipped: 0, remaining: 0, zeroPoints: 0 }, scales: [], queue: { notStarted: 0, oldestDays: null } }], period: { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, truncated: false } }));
  await page.goto('/admin/checklists/sheet-analytics');
  await expect(page.getByText('За этот период ещё нет сессий', { exact: false })).toBeVisible();
});

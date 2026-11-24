import { expect, test } from '@playwright/test';
import { departmentSklad, employeeAnna, filterSetSaves, installSheetAnalyticsMocks, layoutSaves, sheetA, sheetB } from '../fixtures/checklist-sheet-analytics.js';

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
    await page.getByRole('button', { name: /^Чек-листы: Все доступные/ }).click();
    await page.getByTestId('sheet-analytics-picker').getByLabel(/Охрана труда/).click();
    await expect(page).toHaveURL(new RegExp(`sheets=${sheetB}$|sheets=${sheetB}&`));
    await expect(page.getByRole('table', { name: 'Показатели по чек-листам' }).getByText('Охрана труда')).toHaveCount(0);
    expect(requests.at(-1)?.searchParams.get('checklistIds')).toBe(sheetB);
    await page.reload();
    await page.getByRole('button', { name: /^Чек-листы: / }).click();
    await expect(page.getByTestId('sheet-analytics-picker').getByLabel(/Охрана труда/)).not.toBeChecked();
    await page.getByRole('checkbox', { name: /Все доступные/ }).click();
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
  await page.route('**/api/v1/checklists/analytics/overview**', (route) => route.fulfill({ json: { total: { plan: { planned: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, remaining: 0 }, completionPercentage: null, selfCompleted: 0, averagePercentage: null, criteria: { total: 0, answered: 0, skipped: 0, remaining: 0, zeroPoints: 0 }, scales: [], queue: { notStarted: 0, oldestDays: null }, guests: { completed: 0, averagePercentage: null } }, sheets: [{ checklistId: sheetA, title: 'Охрана труда', plan: { planned: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, remaining: 0 }, completionPercentage: null, selfCompleted: 0, averagePercentage: null, criteria: { total: 0, answered: 0, skipped: 0, remaining: 0, zeroPoints: 0 }, scales: [], queue: { notStarted: 0, oldestDays: null }, guests: { completed: 0, averagePercentage: null } }], period: { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, truncated: false } }));
  await page.goto('/admin/checklists/sheet-analytics');
  await expect(page.getByText('За этот период ещё нет сессий', { exact: false })).toBeVisible();
});

test('analytics filters: select found sheets, pick employees by name and save the set of filters (PR 518)', async ({ page }) => {
  const requests = await installSheetAnalyticsMocks(page, 'admin');
  filterSetSaves.length = 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/checklists/sheet-analytics');
  await expect(page.getByRole('table', { name: 'Показатели по чек-листам' })).toBeVisible();

  // Sheets: search, "select found" keeps the match, the counter and the chip follow.
  await page.getByRole('button', { name: /^Чек-листы: Все доступные/ }).click();
  await page.getByLabel('Поиск чек-листов').fill('склад');
  await page.getByRole('button', { name: /Выбрать найденные/ }).click();
  await expect(page).toHaveURL(new RegExp(`sheets=${sheetB}`));
  await expect(page.getByText('Выбрано 1 из 2')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Выбранные чек-листы' }).getByText('Складская приёмка')).toBeVisible();

  // Employees: found by name, sent to the server as employeeIds, kept in the address bar.
  await page.getByRole('button', { name: /^Сотрудник: Все сотрудники/ }).click();
  await page.getByLabel('Поиск сотрудников').fill('иванова');
  await page.getByRole('checkbox', { name: 'Иванова Анна' }).click();
  await expect(page).toHaveURL(new RegExp(`employees=${employeeAnna}`));
  await expect.poll(() => requests.at(-1)?.searchParams.get('employeeIds')).toBe(employeeAnna);

  // The set of filters: switch the employee filter off and save it for the viewer.
  await page.getByRole('button', { name: 'Выбрать фильтры' }).click();
  await page.getByRole('checkbox', { name: 'Сотрудник' }).uncheck();
  await page.getByRole('button', { name: 'Сохранить для меня' }).click();
  await expect.poll(() => filterSetSaves.at(-1)).toEqual({ filters: ['period', 'sheets', 'department', 'manager'], scope: 'user' });
  await expect(page.getByRole('button', { name: /^Сотрудник: / })).toHaveCount(0);
  // An administrator may also make it the default of the organization.
  await page.getByRole('button', { name: 'Сделать по умолчанию для всех' }).click();
  await expect.poll(() => filterSetSaves.at(-1)?.scope).toBe('organization');
});

test('analytics dashboard: trend, departments and weak spots, a criterion opens the checklist page and back keeps the filters (PR 519)', async ({ page }) => {
  const requests = await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter');
  await expect(page.getByRole('heading', { name: 'Динамика выполнения' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Динамика выполнения: 05\.10 64%, 12\.10 72%, 19\.10 81%/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Выполнение по подразделениям' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Слабые места' })).toBeVisible();
  // PR 520: the pie, the heat map, the ranking and the key figures with the change against the previous period.
  await expect(page.getByRole('img', { name: 'Результаты проверок: Хороший результат 50%, С замечаниями 30%, Плохой результат 20%' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Тепловая карта: день и час' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ключевые числа' })).toBeVisible();
  await expect(page.getByTestId('sheet-analytics-widget-kpi')).toContainText('к прошлому периоду');
  // The detailed criteria table is no longer on this page.
  await expect(page.getByTestId('item-analytics')).toHaveCount(0);

  // A department bar narrows the dashboard to it.
  await page.getByRole('button', { name: 'Показать только: Склад' }).click();
  await expect(page).toHaveURL(new RegExp(`departments=${departmentSklad}`));
  await expect.poll(() => requests.at(-1)?.searchParams.get('departmentIds')).toBe(departmentSklad);

  // A weak criterion opens its checklist on its own page with the same filters; "Back" returns to the summary with them.
  await page.getByRole('link', { name: /Каски надеты/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/checklists/sheet-analytics/${sheetA}\\?.*period=quarter`));
  await expect(page.getByTestId('item-analytics')).toBeVisible();
  await page.getByRole('link', { name: /Назад к сводке/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/checklists/sheet-analytics\\?.*departments=${departmentSklad}`));
  await expect(page.getByRole('heading', { name: 'Слабые места' })).toBeVisible();
});


test('analytics dashboard: customize cards, size, order and drag, saved per user, reset and the organization default (PR 520)', async ({ page }) => {
  layoutSaves.length = 0;
  await installSheetAnalyticsMocks(page, 'admin');
  // Tall enough to show every card, so that dragging needs no scrolling.
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter');
  const widgets = page.locator('[data-testid^="sheet-analytics-widget-"]');
  await expect(widgets).toHaveCount(8);

  // A ranking row narrows the dashboard to that employee.
  await page.getByRole('button', { name: 'Показать только: Иванова Анна' }).click();
  await expect(page).toHaveURL(new RegExp(`employees=${employeeAnna}`));

  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  // The switches turn a card off and on again.
  await page.getByRole('checkbox', { name: 'Тепловая карта: день и час' }).uncheck();
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);
  await expect(widgets).toHaveCount(7);
  await expect.poll(() => layoutSaves.at(-1)?.widgets?.some((widget) => widget.id === 'heat')).toBe(false);
  // Size and order of one card.
  await page.getByRole('button', { name: 'Размер S: Результаты проверок' }).click();
  await expect(page.getByTestId('sheet-analytics-widget-donut')).toHaveClass(/sheet-analytics-widget--s/);
  await page.getByRole('button', { name: 'Вниз: Ключевые числа' }).click();
  await expect.poll(() => layoutSaves.at(-1)?.widgets?.[1]?.id).toBe('kpi');
  // Dragging a card onto another one swaps their places.
  const order = async () => widgets.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')!.replace('sheet-analytics-widget-', '')));
  const before = await order();
  await page.getByTestId('sheet-analytics-widget-people').getByRole('heading').dragTo(page.getByTestId(`sheet-analytics-widget-${before[0]}`).getByRole('heading'));
  await expect.poll(order).toEqual(['people', ...before.slice(0, -1)]);
  await page.getByRole('button', { name: /Готово/ }).click();

  // The layout belongs to the user: a reload keeps it.
  await page.reload();
  await expect(widgets).toHaveCount(7);
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);
  expect((await order())[0]).toBe('people');
  await expect(page.getByTestId('sheet-analytics-widget-donut')).toHaveClass(/sheet-analytics-widget--s/);

  // An administrator can make the set the default of the organization; "Back to default" resets the own one.
  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  await page.getByRole('button', { name: 'Сделать набором по умолчанию для всех' }).click();
  await expect.poll(() => layoutSaves.at(-1)?.scope).toBe('organization');
  await page.getByRole('button', { name: 'Вернуть по умолчанию' }).click();
  await expect.poll(() => layoutSaves.at(-1)).toEqual({ widgets: null, scope: 'user' });
  // With the own layout gone the organization default (saved above) applies.
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);
  await expect(page.getByTestId('sheet-analytics-widget-people')).toBeVisible();
});

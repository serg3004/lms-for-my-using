import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { departmentSklad, employeeAnna, filterSetSaves, installSheetAnalyticsMocks, layoutSaves, placeSessionId, placesMode, placesRequests, sheetA, sheetB, sliceRequests, sliceSessionId, tileRequests } from '../fixtures/checklist-sheet-analytics.js';

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
  await expect(page.getByRole('group', { name: 'Результаты проверок: Хороший результат 50%, С замечаниями 30%, Плохой результат 20%' })).toBeVisible();
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


/** The cards of the dashboard the last save left open. */
const openCards = () => { const save = layoutSaves.at(-1); return save?.dashboards?.find((dashboard) => dashboard.id === (save.current ?? save.dashboards![0]!.id))?.widgets; };

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
  await expect.poll(() => openCards()?.some((widget) => widget.id === 'heat')).toBe(false);
  // Size and order of one card.
  await page.getByRole('button', { name: 'Размер S: Результаты проверок' }).click();
  await expect(page.getByTestId('sheet-analytics-widget-donut')).toHaveClass(/sheet-analytics-widget--s/);
  await page.getByRole('button', { name: 'Вниз: Ключевые числа' }).click();
  await expect.poll(() => openCards()?.[1]?.id).toBe('kpi');
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
  await expect.poll(() => layoutSaves.at(-1)).toEqual({ dashboards: null, scope: 'user' });
  // With the own layout gone the organization default (saved above) applies.
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);
  await expect(page.getByTestId('sheet-analytics-widget-people')).toBeVisible();
});


test('analytics dashboard: what each card shows can be chosen (PR 520)', async ({ page }) => {
  layoutSaves.length = 0;
  await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter');
  await expect(page.getByRole('img', { name: /Динамика выполнения: 05\.10 64%/ })).toBeVisible();
  await page.getByRole('button', { name: /Настроить дашборд/ }).click();

  // The metric of the trend: completion = done / planned of every week.
  await page.getByLabel('Показатель: Динамика выполнения').selectOption('completion');
  await expect(page.getByRole('img', { name: /Динамика выполнения: 05\.10 67%, 12\.10 100%, 19\.10 100%/ })).toBeVisible();
  await expect.poll(() => openCards()?.find((widget) => widget.id === 'trend')?.options).toEqual({ metric: 'completion' });
  // Back to the default metric stores nothing.
  await page.getByLabel('Показатель: Динамика выполнения').selectOption('average');
  await expect.poll(() => openCards()?.find((widget) => widget.id === 'trend')?.options).toBeUndefined();

  // The figures of the key numbers: one more tile.
  const kpi = page.getByTestId('sheet-analytics-widget-kpi');
  await expect(kpi.locator('.stat-card')).toHaveCount(4);
  await page.getByLabel('Не начато: Ключевые числа').check();
  await expect(kpi.locator('.stat-card')).toHaveCount(5);
  await expect.poll(() => openCards()?.find((widget) => widget.id === 'kpi')?.options).toEqual({ figures: ['completion', 'average', 'done', 'overdue', 'queue'] });

  // The pie by the status of the plan, the ranking by the number of checks and the working days of the heat map.
  await page.getByLabel('Показать: Результаты проверок').selectOption('plan');
  await expect(page.getByTestId('sheet-analytics-widget-donut').getByRole('listitem').filter({ hasText: 'В процессе' })).toBeVisible();
  await page.getByLabel('Показатель: Рейтинг сотрудников').selectOption('sessions');
  await expect(page.getByTestId('sheet-analytics-widget-people').getByRole('listitem').first()).toContainText('Иванова Анна');
  await page.getByLabel('Дни: Тепловая карта: день и час').selectOption('work');
  await expect(page.getByTestId('sheet-analytics-widget-heat').getByRole('table').locator('tbody tr')).toHaveCount(5);

  // The choices are kept for the user.
  await page.getByRole('button', { name: /Готово/ }).click();
  await page.reload();
  await expect(page.getByTestId('sheet-analytics-widget-donut').getByRole('listitem').filter({ hasText: 'В процессе' })).toBeVisible();
  await expect(page.getByTestId('sheet-analytics-widget-heat').getByRole('table').locator('tbody tr')).toHaveCount(5);
});

test('analytics dashboard: several named dashboards (PR 520)', async ({ page }) => {
  layoutSaves.length = 0;
  await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter');
  // One dashboard: no tabs until the person customizes.
  await expect(page.getByRole('group', { name: 'Дашборды' })).toHaveCount(0);
  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  await page.getByRole('button', { name: '+ Новый дашборд' }).click();
  await page.getByLabel('Название дашборда').fill('Руководителю');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  const tabs = page.getByRole('group', { name: 'Дашборды' });
  await expect(tabs.getByRole('button', { name: 'Руководителю' })).toHaveAttribute('aria-pressed', 'true');
  await expect(tabs.getByRole('button', { name: 'Основной' })).toHaveAttribute('aria-pressed', 'false');

  // The new one is set up on its own; "Main" keeps every card.
  await page.getByRole('checkbox', { name: 'Тепловая карта: день и час' }).uncheck();
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Основной' }).click();
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toBeVisible();
  await expect.poll(() => layoutSaves.at(-1)?.current).toBe('main');
  expect(layoutSaves.at(-1)?.dashboards?.map((dashboard) => dashboard.name)).toEqual(['', 'Руководителю']);

  // Rename, then leave customizing: the tabs stay, and so does the open dashboard after a reload.
  await tabs.getByRole('button', { name: 'Руководителю' }).click();
  await page.getByRole('button', { name: 'Переименовать' }).click();
  await page.getByLabel('Название дашборда').fill('Для отчёта');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(tabs.getByRole('button', { name: 'Для отчёта' })).toBeVisible();
  await page.getByRole('button', { name: /Готово/ }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Дашборды' }).getByRole('button', { name: 'Для отчёта' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toHaveCount(0);

  // Delete the open one: "Main" opens again, and the last dashboard cannot be deleted.
  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  await page.getByRole('button', { name: 'Удалить дашборд' }).click();
  await expect(page.getByRole('group', { name: 'Дашборды' }).getByRole('button', { name: 'Основной' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Удалить дашборд' })).toBeDisabled();
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toBeVisible();
});

test('analytics dashboard: a pie sector and a heat map cell open the results behind them (PR 520)', async ({ page }) => {
  sliceRequests.length = 0;
  const requests = await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter&departments=' + departmentSklad);

  await page.getByTestId('sheet-analytics-widget-donut').locator('li').getByRole('button', { name: 'Открыть подробности: Хороший результат' }).click();
  await expect(page).toHaveURL(/slice=result%3Agood/);
  const slice = page.getByTestId('sheet-analytics-slice');
  await expect(slice.getByRole('heading', { name: 'Хороший результат' })).toBeVisible();
  await expect(slice).toContainText('Иванова Анна');
  await expect(slice).toContainText('Найдено результатов: 2');
  expect(sliceRequests.at(-1)?.searchParams.get('result')).toBe('good');
  // The filters of the dashboard apply to the list.
  expect(sliceRequests.at(-1)?.searchParams.get('departmentIds')).toBe(departmentSklad);
  // A session opens its report; a result without a session has no such link.
  await expect(slice.getByRole('link', { name: 'Открыть' })).toHaveCount(1);
  await expect(slice.getByRole('link', { name: 'Открыть' })).toHaveAttribute('href', `/admin/checklists/sessions/${sliceSessionId}`);

  // "Back" returns to the dashboard with the filters and no slice.
  await page.getByRole('link', { name: /Назад к сводке/ }).click();
  await expect(page).toHaveURL(new RegExp(`departments=${departmentSklad}`));
  await expect(page).not.toHaveURL(/slice=/);
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toBeVisible();

  // A heat map cell: Monday, 8:00-10:00.
  await page.getByRole('button', { name: /Открыть подробности: Пн, 8:00–10:00/ }).click();
  await expect(page).toHaveURL(/slice=slot%3A0%3A4/);
  await expect(page.getByRole('heading', { name: 'Пн, 8:00–10:00' })).toBeVisible();
  await expect.poll(() => sliceRequests.at(-1)?.searchParams.get('weekday')).toBe('0');
  expect(sliceRequests.at(-1)?.searchParams.get('block')).toBe('4');
  expect(sliceRequests.at(-1)?.searchParams.get('tzOffset')).not.toBeNull();
  expect(requests.length).toBeGreaterThan(0);
});

test('analytics dashboard: the check map shows the checks that have a place and opens their details (PR 521)', async ({ page }) => {
  placesMode.value = 'data';
  placesRequests.length = 0;
  tileRequests.length = 0;
  layoutSaves.length = 0;
  await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter&departments=' + departmentSklad);
  // The card is off by default: no request for places and no request to the tile server.
  await expect(page.getByTestId('sheet-analytics-widget-heat')).toBeVisible();
  await expect(page.getByTestId('sheet-analytics-widget-map')).toHaveCount(0);
  expect(placesRequests).toHaveLength(0);
  expect(tileRequests).toHaveLength(0);

  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  await page.getByRole('checkbox', { name: 'Карта проверок' }).check();
  const map = page.getByTestId('sheet-analytics-widget-map');
  await expect(map.getByRole('button', { name: /Охрана труда, Иванова Анна/ })).toHaveCount(2);
  await expect(map.getByRole('button', { name: /Складская приёмка, Петров Пётр/ })).toHaveCount(1);
  await expect(map).toContainText('Место есть у 3 из 4 завершённых проверок.');
  await expect(map).toContainText('не координаты проверок');
  // The filters of the dashboard apply to the map; the background comes from the tile server.
  expect(placesRequests.at(-1)?.searchParams.get('departmentIds')).toBe(departmentSklad);
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  await expect.poll(() => layoutSaves.at(-1)?.dashboards?.[0]?.widgets.map((widget) => widget.id)).toContain('map');

  // A point opens its details with the links to the checklist results and the report.
  await map.getByRole('button', { name: /Складская приёмка, Петров Пётр/ }).click();
  const details = map.getByRole('status');
  await expect(details).toContainText('Складская приёмка');
  await expect(details).toContainText('Петров Пётр');
  await expect(details).toContainText('40%');
  await expect(details).toContainText('место в начале проверки');
  await expect(details).toContainText('точность 250 м');
  await expect(details.getByRole('link', { name: 'Открыть отчёт' })).toHaveAttribute('href', '/admin/checklists/sessions/77777777-7777-4777-8777-777777777777');
  await expect(details.getByRole('link', { name: 'Открыть результаты чек-листа' })).toHaveAttribute('href', new RegExp(`${sheetB}`));
  await details.getByRole('button', { name: 'Закрыть подробности' }).click();
  await expect(details).toHaveCount(0);

  // Zoom and "show all" move the map; the points stay on it.
  const point = map.getByRole('button', { name: new RegExp(`Охрана труда, Иванова Анна, .*92%`) });
  const before = await point.boundingBox();
  await map.getByRole('button', { name: 'Приблизить' }).click();
  const zoomed = await point.boundingBox();
  expect(zoomed?.x).not.toBe(before?.x);
  await map.getByRole('button', { name: 'Показать все проверки' }).click();
  const after = await point.boundingBox();
  expect(after).toEqual(before);

  // The text list is there for those who do not use the map.
  await expect(map.getByRole('table')).toContainText('43.2380, 76.9450');

  // The density view is chosen per card and kept.
  await page.getByLabel('Вид: Карта проверок').selectOption('density');
  await expect.poll(() => layoutSaves.at(-1)?.dashboards?.[0]?.widgets.find((widget) => widget.id === 'map')?.options).toEqual({ view: 'density' });
  await page.getByRole('button', { name: /Готово/ }).click();
  await page.reload();
  await expect(page.getByTestId('sheet-analytics-widget-map').getByRole('button', { name: new RegExp(`Охрана труда, Иванова Анна`) })).toHaveCount(2);
  expect(placeSessionId).toBeTruthy();
});

test('analytics dashboard: the check map explains how to get points and recovers from an error (PR 521)', async ({ page }) => {
  layoutSaves.length = 0;
  placesMode.value = 'empty';
  await installSheetAnalyticsMocks(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 3000 });
  await page.goto('/admin/checklists/sheet-analytics?period=quarter');
  await page.getByRole('button', { name: /Настроить дашборд/ }).click();
  await page.getByRole('checkbox', { name: 'Карта проверок' }).check();
  const map = page.getByTestId('sheet-analytics-widget-map');
  await expect(map).toContainText('включите «Геолокацию» в настройках чек-листа');
  await expect(map).toContainText('Завершённых проверок без места: 3.');

  // An error is shown with a retry that loads the map when the server answers again.
  placesMode.value = 'error';
  await page.reload();
  await expect(page.getByTestId('sheet-analytics-widget-map').getByRole('alert')).toContainText('Не удалось загрузить карту.');
  placesMode.value = 'data';
  await page.getByTestId('sheet-analytics-widget-map').getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByTestId('sheet-analytics-widget-map').getByRole('button', { name: /Охрана труда, Иванова Анна/ })).toHaveCount(2);
});

test('the page policy lets the check map draw tiles without opening anything else (PR 521)', () => {
  const config = readFileSync(new URL('../../../infra/nginx/security-headers.conf', import.meta.url), 'utf8');
  expect(config).toContain("img-src 'self' data: blob: https:");
  expect(config).toContain("script-src 'self';");
  expect(config).toContain("object-src 'none'");
});

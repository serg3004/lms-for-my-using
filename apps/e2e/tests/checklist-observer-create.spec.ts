import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const observerId = '44444444-4444-4444-8444-444444444444';
const learnerId = '11111111-1111-4111-8111-111111111111';
const checklistId = '33333333-3333-4333-8333-333333333333';
const organizationId = '55555555-5555-4555-8555-555555555555';

async function setup(page: Page, options: { createStatus?: number; lookup?: 'empty' | 'error' } = {}) {
  let submitted: Record<string, unknown> | null = null;
  let starts = 0;
  let listLoads = 0;
  let lookups = 0;
  let observerLookups = 0;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: observerId, organizationId, email: 'observer@example.invalid', firstName: 'Olga', lastName: 'Observer',
      middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['instructor'],
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklist-sessions/participants') {
      if (url.searchParams.get('role') === 'observer') observerLookups++;
      lookups++;
      if (options.lookup === 'error' && lookups === 1) return route.fulfill({ status: 500, json: { message: 'Lookup unavailable' } });
      const items = options.lookup === 'empty' ? [] : [{ id: learnerId, firstName: 'Alex', lastName: 'Learner', email: 'alex@example.invalid', position: null }];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    }
    if (path === '/checklists') return route.fulfill({ json: [{ id: checklistId, title: 'Safety training', status: 'published', items: [] }] });
    if (path === '/checklist-sessions/bulk') {
      submitted = route.request().postDataJSON();
      if (options.createStatus) return route.fulfill({ status: options.createStatus, json: { message: `Create rejected ${options.createStatus}` } });
      return route.fulfill({ json: { created: 1, skipped: 0, failed: 0, results: [{ learnerId, status: 'created', sessionId: 'new-session' }] } });
    }
    if (path === '/checklist-sessions/new-session') return route.fulfill({ json: { version: 1 } });
    if (path.endsWith('/start')) { starts++; return route.fulfill({ json: { version: 2, status: 'in_progress' } }); }
    if (path === '/checklist-sessions/to-conduct') { listLoads++; return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } }); }
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/instructor/checklists/sessions');
  await page.getByRole('button', { name: 'Новая сессия', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Эту сессию проведёте вы.');
  await expect(page.getByRole('button', { name: 'Сменить наблюдателя' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Найти наблюдателя' })).toHaveCount(0);
  return { submitted: () => submitted, starts: () => starts, listLoads: () => listLoads, observerLookups: () => observerLookups };
}
async function chooseEmployeeAndChecklist(page: Page) {
  await page.getByRole('checkbox', { name: /Alex Learner/ }).check();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('radio', { name: 'Safety training', exact: true }).check();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
}
async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test.describe('observer creates own sessions (PR 331)', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 390, height: 844 } });

  test('creates a scheduled session from the mobile observer page and refreshes the list', async ({ page }, testInfo) => {
    const requests = await setup(page);
    await checkAccessibility(page);
    const name = await page.getByRole('dialog').getByText('Olga Observer', { exact: true }).boundingBox();
    const hint = await page.getByText('Эту сессию проведёте вы.', { exact: true }).boundingBox();
    expect(name).not.toBeNull(); expect(hint).not.toBeNull();
    expect(hint!.y).toBeGreaterThanOrEqual(name!.y + name!.height);
    await testInfo.attach('observer-create-mobile', { body: await page.screenshot({ path: testInfo.outputPath('observer-create-mobile.png'), fullPage: true }), contentType: 'image/png' });
    await chooseEmployeeAndChecklist(page);
    await page.getByRole('radio', { name: 'Запланировать на потом' }).check();
    await page.getByLabel('Дата и время', { exact: true }).fill('2026-11-01T12:00');
    await page.getByLabel('Продолжительность, мин (необязательно)', { exact: true }).fill('30');
    await checkAccessibility(page);
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.getByLabel('Дата и время', { exact: true })).toHaveValue('2026-11-01T12:00');
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect.poll(requests.submitted).toMatchObject({ checklistId, observerId, learnerIds: [learnerId], scheduledAt: '2026-11-01T12:00:00.000Z', durationMinutes: 30 });
    await expect(page.getByText('Сессии созданы', { exact: true })).toBeVisible();
    expect(requests.starts()).toBe(0);
    expect(requests.observerLookups()).toBe(0);
    await expect.poll(requests.listLoads).toBeGreaterThan(1);
  });

  test('can start its own newly created session immediately', async ({ page }) => {
    const requests = await setup(page);
    await chooseEmployeeAndChecklist(page);
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect.poll(requests.starts).toBe(1);
    expect(requests.submitted()).toMatchObject({ observerId, scheduledAt: null });
  });

  for (const status of [403, 404, 409]) {
    test(`preserves the wizard after server rejection ${status}`, async ({ page }) => {
      await setup(page, { createStatus: status });
      await chooseEmployeeAndChecklist(page);
      await page.getByRole('button', { name: 'Далее', exact: true }).click();
      await page.getByRole('button', { name: 'Создать', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText(`Create rejected ${status}`);
      await expect(page.getByRole('dialog')).toContainText('Olga Observer');
      await expect(page.getByRole('button', { name: 'Создать', exact: true })).toBeEnabled();
    });
  }
  test('explains an empty participant scope and disables Next', async ({ page }) => {
    await setup(page, { lookup: 'empty' });
    await expect(page.getByRole('dialog')).toContainText('Сотрудники в вашей зоне не найдены.');
    await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
  });
  test('recovers a failed participant lookup through Retry', async ({ page }) => {
    await setup(page, { lookup: 'error' });
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Не удалось загрузить сотрудников.');
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Alex Learner/ })).toBeVisible();
  });
});

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const observerId = '44444444-4444-4444-8444-444444444444';
const learnerA = '11111111-1111-4111-8111-111111111111';
const learnerB = '22222222-2222-4222-8222-222222222222';
const checklistId = '33333333-3333-4333-8333-333333333333';
const organizationId = '55555555-5555-4555-8555-555555555555';

async function openWizard(page: Page) {
  let submitted: Record<string, unknown> | null = null;
  let autoStartRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: '66666666-6666-4666-8666-666666666666', organizationId, email: 'admin@example.invalid',
      firstName: 'Test', lastName: 'Admin', middleName: null, position: null, shift: null, phone: null,
      status: 'active', locale: 'ru', timezone: 'America/New_York', roles: ['admin'],
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists') return route.fulfill({ json: [{ id: checklistId, title: 'Safety training', status: 'published', items: [] }] });
    if (path === '/checklist-sessions/participants') {
      const items = url.searchParams.get('role') === 'observer'
        ? [{ id: observerId, firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid', position: null }]
        : [{ id: learnerA, firstName: 'Alex', lastName: 'Learner', email: 'alex@example.invalid', position: null }, { id: learnerB, firstName: 'Mira', lastName: 'Learner', email: 'mira@example.invalid', position: null }];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    }
    if (path === '/checklist-sessions/bulk') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: {
        created: 1, skipped: 1, failed: 0,
        results: [{ learnerId: learnerA, status: 'created', sessionId: 'new-session' }, { learnerId: learnerB, status: 'skipped' }],
      } });
    }
    if (path === '/checklist-sessions/new-session' || path.endsWith('/start')) autoStartRequests++;
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  await page.goto('/admin/checklists/sessions');
  await page.getByRole('button', { name: /Новая сессия/ }).click();
  // Selection replaces the radio with a participant card (PR 326).
  await page.getByRole('radio', { name: /Olga Observer/ }).click();
  await expect(page.getByRole('button', { name: 'Сменить наблюдателя' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Alex Learner/ }).check();
  await page.getByRole('checkbox', { name: /Mira Learner/ }).check();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('radio', { name: 'Safety training', exact: true }).check();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  return { submitted: () => submitted, autoStartRequests: () => autoStartRequests };
}

test.describe('individual checklist session scheduling (PR 329)', () => {
  test.use({ timezoneId: 'America/New_York', viewport: { width: 390, height: 844 } });

  test('keeps the shared bulk format and saves optional duration', async ({ page }) => {
    const requests = await openWizard(page);
    await expect(page.getByRole('radio', { name: 'Одинаковое для всех' })).toBeChecked();
    await page.getByRole('radio', { name: 'Запланировать на потом' }).check();
    await page.getByLabel('Дата и время', { exact: true }).fill('2026-03-08T03:30');
    await page.getByLabel('Продолжительность, мин (необязательно)', { exact: true }).fill('60');
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.getByLabel('Дата и время', { exact: true })).toHaveValue('2026-03-08T03:30');
    await expect(page.getByLabel('Продолжительность, мин (необязательно)', { exact: true })).toHaveValue('60');
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect.poll(requests.submitted).toMatchObject({
      checklistId, observerId, learnerIds: [learnerA, learnerB],
      scheduledAt: '2026-03-08T07:30:00.000Z', durationMinutes: 60, timezone: 'America/New_York',
    });
    expect(requests.submitted()).not.toHaveProperty('schedules');
    expect(requests.autoStartRequests()).toBe(0);
  });

  test('validates each appointment, preserves edits, handles DST and never auto-starts individual sessions', async ({ page }, testInfo) => {
    const requests = await openWizard(page);
    await page.getByRole('radio', { name: 'Для каждой отдельно' }).check();
    const alex = page.getByRole('group', { name: 'Alex Learner', exact: true });
    const mira = page.getByRole('group', { name: 'Mira Learner', exact: true });
    const next = page.getByRole('button', { name: 'Далее', exact: true });
    await expect(next).toBeDisabled();
    await alex.getByLabel('Дата и время', { exact: true }).fill('2026-03-08T01:30');
    await alex.getByLabel('Продолжительность, мин (необязательно)', { exact: true }).fill('20');
    await expect(next).toBeDisabled();
    await mira.getByLabel('Дата и время', { exact: true }).fill('2026-03-08T02:30');
    await expect(next).toBeDisabled(); // This local hour does not exist in New York.
    await expect(mira.getByRole('alert')).toContainText('Это время не существует');
    await mira.getByLabel('Дата и время', { exact: true }).fill('2026-03-08T03:30');
    await mira.getByLabel('Продолжительность, мин (необязательно)', { exact: true }).fill('0');
    await expect(next).toBeDisabled();
    await mira.getByLabel('Продолжительность, мин (необязательно)', { exact: true }).fill('45');
    await expect(next).toBeEnabled();
    await page.getByRole('radio', { name: 'Одинаковое для всех' }).check();
    await page.getByRole('radio', { name: 'Для каждой отдельно' }).check();
    await expect(alex.getByLabel('Продолжительность, мин (необязательно)', { exact: true })).toHaveValue('20');
    await expect(mira.getByLabel('Дата и время', { exact: true })).toHaveValue('2026-03-08T03:30');
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(accessibility.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await testInfo.attach('individual-schedule-mobile', {
      body: await page.screenshot({ path: testInfo.outputPath('individual-schedule-mobile.png'), fullPage: true }),
      contentType: 'image/png',
    });
    await next.click();
    await expect(page.getByRole('dialog')).toContainText('20 мин');
    await expect(page.getByRole('dialog')).toContainText('45 мин');
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(mira.getByLabel('Продолжительность, мин (необязательно)', { exact: true })).toHaveValue('45');
    await next.click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect.poll(requests.submitted).toMatchObject({ schedules: [
      { learnerId: learnerA, scheduledAt: '2026-03-08T06:30:00.000Z', durationMinutes: 20, timezone: 'America/New_York' },
      { learnerId: learnerB, scheduledAt: '2026-03-08T07:30:00.000Z', durationMinutes: 45, timezone: 'America/New_York' },
    ] });
    expect(requests.autoStartRequests()).toBe(0);
    await expect(page.getByText('Сессии созданы', { exact: true })).toBeVisible();
  });
});

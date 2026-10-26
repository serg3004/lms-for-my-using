import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const sessionId = '11111111-1111-4111-8111-111111111111';
const link = `/learn/checklists?sessionId=${sessionId}`;
const types = ['scheduled', 'rescheduled', 'deleted', 'completed'];
async function setup(page: Page, unavailable = false) {
  let directLoads = 0;
  let markedRead = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'self@example.invalid', firstName: 'Alex', lastName: 'Learner', status: 'active', locale: 'ru', timezone: 'UTC', roles: ['learner'] } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 4 } });
    if (path === '/notifications') return route.fulfill({ json: types.map((type) => ({ id: type, type: `checklist_session_${type}`, data: { sessionId }, link: type === 'deleted' ? '/learn/checklists' : link, createdAt: '2026-10-26T12:00:00Z', readAt: null })) });
    if (path === '/notifications/completed/read') { markedRead = true; return route.fulfill({ json: { readAt: '2026-10-26T12:00:00Z' } }); }
    if (path === '/checklist-instances/mine') return route.fulfill({ json: [] });
    // The notification's completed session deliberately does not appear on the first list page.
    if (path === '/checklist-sessions') return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
    if (path === `/checklist-sessions/${sessionId}`) {
      directLoads++;
      if (unavailable) return route.fulfill({ status: 404, json: { message: 'Session not found' } });
      return route.fulfill({ json: { id: sessionId, instanceId: 'instance', status: 'completed', checklist: { title: 'Training from notification' }, observer: { firstName: 'Olga', lastName: 'Observer' }, scheduledAt: null, result: { visible: false }, strengths: 'Private feedback must stay hidden', developmentAreas: null, nextSteps: null } });
    }
    if (path === '/checklist-instances/instance') return route.fulfill({ json: { results: [], checklist: { items: [] } } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  return { directLoads: () => directLoads, markedRead: () => markedRead };
}

test.describe('session change notifications (PR 345)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('renders four localized notices and opens a scoped session outside the list without exposing feedback', async ({ page }, testInfo) => {
    const requests = await setup(page);
    await page.goto('/learn/notifications');
    for (const title of ['Назначена сессия наблюдения', 'Сессия наблюдения изменена', 'Сессия наблюдения удалена', 'Сессия наблюдения завершена']) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    await testInfo.attach('session-notifications-mobile', { body: await page.screenshot({ path: testInfo.outputPath('session-notifications-mobile.png'), fullPage: true }), contentType: 'image/png' });
    await page.getByRole('button', { name: /Сессия наблюдения завершена/ }).click();
    await expect(page).toHaveURL(new RegExp(`sessionId=${sessionId}`));
    await expect(page.getByRole('heading', { name: 'Training from notification' })).toBeVisible({ timeout: 10000 });
    expect(requests.markedRead()).toBe(true);
    expect(requests.directLoads()).toBeGreaterThan(0);
    await expect(page.getByText('Private feedback must stay hidden')).toHaveCount(0);
    await expect(page.getByText(/100%|other-person@example/)).toHaveCount(0);
    await expect(page.getByText('Training from notification')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await testInfo.attach('session-from-notification-mobile', { body: await page.screenshot({ path: testInfo.outputPath('session-from-notification-mobile.png'), fullPage: true }), contentType: 'image/png' });
    await page.getByRole('button', { name: /Мои обучающие сессии/ }).click();
    await expect(page).toHaveURL(/\/learn\/checklists$/);
  });
  test('handles a deleted or out-of-scope session and returns safely to the list', async ({ page }) => {
    await setup(page, true);
    await page.goto(`${link}&keep=1`);
    await expect(page.getByText('Эта сессия больше недоступна.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Мои обучающие сессии/ }).click();
    await expect(page).toHaveURL(/\/learn\/checklists\?keep=1$/);
  });
});

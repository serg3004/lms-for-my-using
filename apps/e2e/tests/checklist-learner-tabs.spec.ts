import { expect, test } from '@playwright/test';

// PR 450: the learner's sheets are split into «Назначенные» and «Завершённые», with a search by title.
test.describe('learner checklist tabs and search (PR 450)', () => {
  for (const width of [390, 1280]) test(`tabs, counters, search and the address work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const make = (id: string, title: string, status: string) => ({
      id, organizationId: 'org', checklistId: `c-${id}`, userId: 'learner', assignedBy: null, reviewerId: null, status,
      totalScore: 0, maxScore: 10, percentage: 0, passed: false, scored: true, dueAt: null, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z',
      checklist: { id: `c-${id}`, title, description: null, showPointsToLearner: false, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 70, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [] },
      results: [],
    });
    const instances = [make('a1', 'Открытие смены', 'in_progress'), make('a2', 'Закрытие кассы', 'assigned'), make('d1', 'Приёмка товара', 'completed')];
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklist-instances/mine') return route.fulfill({ json: instances });
      if (path === '/checklists/free') return route.fulfill({ json: [] });
      return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.goto('/learn/checklists');

    const assigned = page.getByRole('tab', { name: 'Назначенные (2)' });
    const completed = page.getByRole('tab', { name: 'Завершённые (1)' });
    await expect(assigned).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Открытие смены', { exact: true })).toBeVisible();
    await expect(page.getByText('Закрытие кассы', { exact: true })).toBeVisible();
    await expect(page.getByText('Приёмка товара', { exact: true })).toHaveCount(0);

    await completed.click();
    await expect(page).toHaveURL(/#completed$/);
    await expect(page.getByText('Приёмка товара', { exact: true })).toBeVisible();
    await expect(page.getByText('Открытие смены', { exact: true })).toHaveCount(0);

    await assigned.click();
    const search = page.getByRole('searchbox', { name: 'Поиск по листам' });
    await search.fill('КАСС');
    await expect(page.getByText('Закрытие кассы', { exact: true })).toBeVisible();
    await expect(page.getByText('Открытие смены', { exact: true })).toHaveCount(0);
    await search.fill('нет такого');
    await expect(page.getByText('Ничего не найдено', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('tab', { name: 'Назначенные (2)' })).toHaveAttribute('aria-selected', 'true');
    await page.goto('/learn/checklists#completed');
    await expect(page.getByRole('tab', { name: 'Завершённые (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

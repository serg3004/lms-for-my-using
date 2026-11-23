import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('uses one author list request with server filters, sorting and pages at 360px', async ({ page }) => {
  const calls: URLSearchParams[] = [];
  const details: string[] = [];
  const alpha = { id: 'a', title: 'Safety procedures', status: 'published', courseId: 'course', courseTitle: 'Operations', questionsCount: 8, attemptsCount: 12, passRate: 75, lastAttemptAt: '2026-11-22T10:00:00Z' };
  const beta = { ...alpha, id: 'b', title: 'Safety induction', questionsCount: 5, passRate: 100 };
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: 'admin', organizationId: 'org', roles: ['admin'], status: 'active', firstName: 'Ada', lastName: 'Admin', locale: 'en', timezone: 'UTC',
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/courses') return route.fulfill({ json: { items: [{ id: 'course', title: 'Operations', organizationId: 'org' }] } });
    if (path === '/assessment-folders') return route.fulfill({ json: {
      folders: [{ id: 'folder', name: 'Safety', parentId: null, childFolderCount: 0, assessmentCount: 2, totalAssessmentCount: 2 }],
      rootAssessmentCount: 2, assessmentCount: 4,
    } });
    if (path === '/assessments/library') {
      const params = url.searchParams;
      calls.push(params);
      const current = Number(params.get('page'));
      return route.fulfill({ json: { items: [current === 2 ? beta : alpha], total: 2, page: current, pageSize: 1 } });
    }
    if (path === '/assessments' || /^\/assessments\/.+\/(questions|results)$/.test(path)) details.push(path);
    return route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/assessments');
  const table = page.getByRole('table');
  await expect(table.getByRole('cell', { name: 'Safety procedures', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '75%', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Operations', exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(details).toEqual([]);

  await page.getByPlaceholder('Find assessment').fill('Safety');
  await page.getByRole('combobox', { name: 'All statuses' }).selectOption('published');
  await page.getByRole('combobox', { name: 'Course', exact: true }).selectOption('course');
  await page.getByRole('combobox', { name: 'Folder', exact: true }).selectOption('folder');
  await expect(page).toHaveURL(/folder=folder/);
  await page.getByRole('combobox', { name: 'Attempts', exact: true }).selectOption('with');
  await expect(page).toHaveURL(/attempts=with/);
  const mine = page.getByRole('checkbox', { name: 'Only mine' });
  await mine.click();
  await expect(mine).toBeChecked();
  await expect(table.getByRole('cell', { name: 'Safety procedures', exact: true })).toBeVisible();
  await table.getByRole('button', { name: 'Pass rate' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.getByRole('cell', { name: 'Safety induction', exact: true })).toBeVisible();
  expect(Object.fromEntries(calls.at(-1)!)).toEqual({
    page: '2', sort: 'passRate', direction: 'asc', search: 'Safety', status: 'published',
    courseId: 'course', folderId: 'folder', mine: 'true', attempts: 'with',
  });
  expect(details).toEqual([]);
  await page.reload();
  await expect(table.getByRole('cell', { name: 'Safety induction', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Only mine' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Folder', exact: true })).toHaveValue('folder');

  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const scan = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
});

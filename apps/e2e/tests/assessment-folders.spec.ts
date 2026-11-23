import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('creates, colors, moves and removes assessment folders on desktop and at 360px', async ({ page }) => {
  const assessments = [
    { id: 'test', title: 'Safety test', status: 'draft', folderId: null as string | null },
    { id: 'other', title: 'Operations test', status: 'draft', folderId: null as string | null },
    { id: 'stock', title: 'Stock test', status: 'draft', folderId: null as string | null },
    { id: 'longread', title: 'Lesson exercise', status: 'draft', folderId: null, isLongreadExercise: true },
  ];
  let folders = [{ id: 'parent', name: 'Operations', color: 'purple', parentId: null as string | null }];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({
      json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'en', timezone: 'UTC' },
    });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/assessments/library') {
      const folderId = new URL(request.url()).searchParams.get('folderId');
      const items = assessments.filter((item) => !folderId || item.folderId === (folderId === 'root' ? null : folderId))
        .map((item) => ({ ...item, questionsCount: 1, attemptsCount: 0 }));
      return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 25 } });
    }
    if (path === '/assessment-folders' && request.method() === 'POST') {
      const folder = { id: 'child', ...request.postDataJSON() };
      folders.push(folder);
      return route.fulfill({ json: folder });
    }
    if (path === '/assessment-folders') return route.fulfill({ json: {
      folders: folders.map((folder) => ({
        ...folder, childFolderCount: folders.filter((child) => child.parentId === folder.id).length,
        assessmentCount: assessments.filter((item) => item.folderId === folder.id).length,
        totalAssessmentCount: assessments.filter((item) => item.folderId === folder.id).length,
      })),
      assessmentCount: assessments.length,
      rootAssessmentCount: assessments.filter((item) => item.folderId === null).length,
    } });
    if (path === '/assessment-folders/bulk') {
      const { action, kind, ids, parentId } = request.postDataJSON() as { action: string; kind: string; ids: string[]; parentId: string | null };
      if (action === 'move' && kind === 'assessment') {
        for (const item of assessments) if (ids.includes(item.id)) item.folderId = parentId;
      }
      if (action === 'delete' && kind === 'folder') {
        folders = folders.filter((folder) => !ids.includes(folder.id));
        for (const item of assessments) if (item.folderId && ids.includes(item.folderId)) item.folderId = null;
      }
      return route.fulfill({ json: { done: ids.length, skipped: 0, results: ids.map((id) => ({ id, result: 'done' })) } });
    }
    if (path === '/assessment-folders/child/delete-impact') return route.fulfill({
      json: { folders: 1, movedToRoot: assessments.filter((item) => item.folderId === 'child') },
    });
    if (path === '/courses') return route.fulfill({ json: { items: [] } });
    if (/^\/assessments\/.+\/(questions|results)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/assessments');
  const table = page.getByRole('table');
  const tree = page.getByRole('navigation', { name: 'Assessment folders' });
  const dialog = page.getByRole('dialog');
  await expect(table.getByText('Longread exercise')).toBeVisible();
  await table.getByRole('button', { name: 'Open folder: Operations' }).click();
  await expect(page).toHaveURL(/folder=parent/);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Folder…', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('Induction');
  await dialog.getByRole('radio', { name: 'Green' }).check();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(table.getByRole('row', { name: /Induction/ }).locator('.folder-glyph--green')).toBeVisible();
  await tree.getByRole('button', { name: 'Collapse Operations' }).click();
  await page.reload();
  await expect(tree.getByRole('button', { name: 'Expand Operations' })).toBeVisible();
  await expect(tree.getByRole('button', { name: /Induction/ })).toHaveCount(0);
  await tree.getByRole('button', { name: 'Expand Operations' }).click();
  await tree.getByRole('button', { name: /All assessments/ }).click();

  await table.getByRole('row', { name: /Safety test/ }).dragTo(tree.getByRole('button', { name: /Induction/ }));
  await expect(table.getByRole('cell', { name: 'Safety test', exact: true })).toHaveCount(0);

  await table.getByRole('checkbox', { name: 'Select assessment: Operations test' }).check();
  await table.getByRole('checkbox', { name: 'Select assessment: Stock test' }).check();
  await page.getByRole('region', { name: /selected/i }).getByRole('button', { name: 'Move to folder…' }).click();
  await dialog.getByRole('radio', { name: 'Induction' }).check();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(tree.getByRole('button', { name: 'Induction (3)' })).toBeVisible();
  await tree.getByRole('button', { name: 'Induction (3)' }).click();
  await expect(page).toHaveURL(/folder=child/);
  await expect(page.getByRole('navigation', { name: 'Folder path' }).getByText('Induction')).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Operations test', exact: true })).toBeVisible();
  await tree.getByRole('button', { name: /Operations \(/ }).click();

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(table.getByRole('button', { name: 'Open folder: Induction' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);

  await table.getByRole('checkbox', { name: 'Select folder: Induction' }).check();
  await page.getByRole('region', { name: /selected/i }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toContainText('Safety test');
  await expect(dialog).toContainText('Operations test');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(table.getByRole('button', { name: 'Open folder: Induction' })).toHaveCount(0);
  await tree.getByRole('button', { name: /All assessments/ }).click();
  await expect(table.getByRole('cell', { name: 'Safety test', exact: true })).toBeVisible();
});

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const sheet = (id: string, title: string, folderId: string | null) => ({
  id, organizationId: 'org', title, description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: 'admin', creator: { id: 'admin', firstName: 'Ada', lastName: 'Admin' }, folderId, createdAt: '2026-10-01T16:47:00.000Z', updatedAt: '2026-10-01T16:47:00.000Z',
  items: [{ id: `${id}-item`, checklistId: id, order: 1, text: 'Criterion', points: 10, isRequired: true, photoRequired: false }],
});
const folder = (id: string, parentId: string | null, name: string, visibleToStaff = false) => ({
  id, parentId, name, visibleToStaff, createdBy: 'admin', createdAt: '2026-10-01T10:00:00.000Z', canManage: true, checklistCount: 0, totalChecklistCount: 0,
});

async function mockApi(page: Page, state: { folders: ReturnType<typeof folder>[]; sheets: ReturnType<typeof sheet>[] }, calls: { method: string; path: string; body: unknown }[]) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists' && method === 'GET') return route.fulfill({ json: state.sheets });
    if (path === '/checklist-folders' && method === 'GET') {
      const direct = (id: string) => state.sheets.filter((item) => item.folderId === id).length;
      return route.fulfill({ json: { checklistCount: state.sheets.length, folders: state.folders.map((item) => ({ ...item, checklistCount: direct(item.id), totalChecklistCount: direct(item.id) })) } });
    }
    if (path === '/checklist-folders' && method === 'POST') {
      const body = request.postDataJSON() as { name: string; parentId?: string | null; visibleToStaff?: boolean };
      calls.push({ method, path, body });
      const created = folder(`folder-${state.folders.length + 1}`, body.parentId ?? null, body.name, body.visibleToStaff);
      state.folders.push(created);
      return route.fulfill({ json: created });
    }
    if (/^\/checklist-folders\/[^/]+\/delete-impact$/.test(path)) return route.fulfill({ json: { folders: 2, checklists: 1, movedToDraft: [] } });
    if (/^\/checklist-folders\/[^/]+$/.test(path) && method === 'DELETE') {
      calls.push({ method, path, body: null });
      state.folders = state.folders.filter((item) => !path.endsWith(`/${item.id}`) && item.parentId !== path.split('/').at(-1));
      return route.fulfill({ json: { folders: 2, checklists: 1, movedToDraft: [] } });
    }
    if (path === '/checklists/bulk') {
      const body = request.postDataJSON() as { ids: string[]; folderId: string | null };
      calls.push({ method, path, body });
      state.sheets = state.sheets.map((item) => (body.ids.includes(item.id) ? { ...item, folderId: body.folderId } : item));
      return route.fulfill({ json: { action: 'move', done: body.ids.length, skipped: 0, results: body.ids.map((id) => ({ id, result: 'done' })) } });
    }
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
}

test.describe('Checklist folders on the list screen (PR 396)', () => {
  test('shows the tree, filters by folder through the URL, creates, moves and deletes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: { method: string; path: string; body: unknown }[] = [];
    const state = {
      folders: [folder('shop', null, 'Магазин', true), folder('till', 'shop', 'Касса')],
      sheets: [sheet('s1', 'Открытие смены', 'till'), sheet('s2', 'Уборка зала', 'shop'), sheet('s3', 'Без папки', null)],
    };
    await mockApi(page, state, calls);
    await page.goto('/admin/checklists');

    const tree = page.getByRole('tree', { name: 'Папки чек-листов' });
    await expect(tree.getByRole('treeitem', { name: /Все листы/ })).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: /Касса/ })).toBeVisible();
    await expect(page.getByText('Открытие смены')).toBeVisible();
    await expect(page.getByText('Без папки')).toBeVisible();
    // A closed folder carries a lock with a text label.
    await expect(tree.getByRole('img', { name: /Закрытая папка/ })).toHaveCount(1);

    // Selecting a folder filters the list, shows the breadcrumbs and keeps the choice in the address.
    await tree.getByRole('treeitem', { name: /Касса/ }).click();
    await expect(page).toHaveURL(/folder=till/);
    await expect(page.getByText('Открытие смены')).toBeVisible();
    await expect(page.getByText('Уборка зала')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Путь к папке' }).getByRole('button', { name: 'Магазин' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Открытие смены')).toBeVisible();
    await expect(page.getByText('Без папки')).toHaveCount(0);

    // A folder id that does not exist falls back to all checklists.
    await page.goto('/admin/checklists?folder=missing');
    await expect(page.getByText('Без папки')).toBeVisible();

    // Create a subfolder of the open folder.
    await tree.getByRole('treeitem', { name: /Магазин/ }).click();
    await page.getByRole('button', { name: 'Новая папка' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Новая подпапка в «Магазин»' })).toBeVisible();
    await dialog.getByLabel('Название папки').fill('Склад');
    await dialog.getByLabel('Видна всем ролям, кроме обучающегося').check();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(tree.getByRole('treeitem', { name: /Склад/ })).toBeVisible();
    expect(calls.find((call) => call.path === '/checklist-folders' && call.method === 'POST')?.body).toEqual({ name: 'Склад', parentId: 'shop', visibleToStaff: true });

    // Move a sheet to a folder from the row menu.
    await tree.getByRole('treeitem', { name: /Все листы/ }).click();
    const row = page.getByRole('row', { name: /Без папки/ });
    await row.getByRole('button', { name: 'Действия' }).click();
    await page.getByRole('menuitem', { name: 'Переместить в папку…' }).click();
    await page.getByRole('dialog').getByLabel('Касса').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Переместить' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Готово: 1, пропущено: 0' })).toBeVisible();
    expect(calls.find((call) => call.path === '/checklists/bulk')?.body).toEqual({ action: 'move', ids: ['s3'], folderId: 'till' });

    // Deleting a folder first states what goes with it.
    await tree.getByRole('treeitem', { name: /Магазин/ }).getByRole('button', { name: /Действия с папкой: Магазин/ }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Папок: 2');
    await expect(confirm).toContainText('чек-листов к удалению: 1');
    await confirm.getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(() => calls.some((call) => call.method === 'DELETE' && call.path === '/checklist-folders/shop')).toBe(true);
    await expect(tree.getByRole('treeitem', { name: /Магазин/ })).toHaveCount(0);
  });

  test('on a narrow screen the tree gives way to a folder picker and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await mockApi(page, { folders: [folder('shop', null, 'Магазин', true), folder('till', 'shop', 'Касса')], sheets: [sheet('s1', 'Открытие смены', 'till')] }, []);
    await page.goto('/admin/checklists');
    await expect(page.getByRole('tree')).toBeHidden();
    await page.getByRole('combobox', { name: 'Папка' }).selectOption('till');
    await expect(page).toHaveURL(/folder=till/);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

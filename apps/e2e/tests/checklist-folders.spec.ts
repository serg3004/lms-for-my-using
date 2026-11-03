import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const sheet = (id: string, title: string, folderId: string | null) => ({
  id, organizationId: 'org', title, description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: 'admin', creator: { id: 'admin', firstName: 'Ada', lastName: 'Admin' }, folderId, createdAt: '2026-10-01T16:47:00.000Z', updatedAt: '2026-10-01T16:47:00.000Z',
  assignmentCount: id === 's1' ? 2 : 0,
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
    if (path === '/checklists' && method === 'POST') {
      const body = request.postDataJSON() as { title: string; folderId?: string | null };
      calls.push({ method, path, body });
      const created = sheet(`new-${state.sheets.length + 1}`, body.title, body.folderId ?? null);
      state.sheets.push(created);
      return route.fulfill({ json: created });
    }
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
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
    if (path === '/checklist-folders/bulk') {
      const body = request.postDataJSON() as { action: 'move' | 'delete'; ids: string[]; parentId?: string | null };
      calls.push({ method, path, body });
      const below = (id: string): string[] => [id, ...state.folders.filter((item) => item.parentId === id).flatMap((item) => below(item.id))];
      const results = body.ids.map((id) => {
        if (body.action === 'move') {
          if (id === 'dup') return { id, result: 'skipped', reason: 'name_conflict' };
          state.folders = state.folders.map((item) => (item.id === id ? { ...item, parentId: body.parentId ?? null } : item));
        }
        return { id, result: 'done' };
      });
      if (body.action === 'delete') { const gone = new Set(body.ids.flatMap(below)); state.folders = state.folders.filter((item) => !gone.has(item.id)); }
      const done = results.filter((item) => item.result === 'done').length;
      return route.fulfill({ json: { action: body.action, done, skipped: results.length - done, results, ...(body.action === 'delete' ? { summary: { folders: 1, checklists: 0, movedToDraft: [] } } : {}) } });
    }
    if (/^\/checklist-folders\/[^/]+\/delete-impact$/.test(path)) return route.fulfill({ json: { folders: 2, checklists: 1, movedToDraft: [] } });
    if (/^\/checklist-folders\/[^/]+$/.test(path) && method === 'PATCH') {
      const body = request.postDataJSON() as { name?: string; parentId?: string | null };
      calls.push({ method, path, body });
      state.folders = state.folders.map((item) => (path.endsWith(`/${item.id}`) ? { ...item, ...(body.name !== undefined ? { name: body.name } : {}), ...(body.parentId !== undefined ? { parentId: body.parentId } : {}) } : item));
      return route.fulfill({ json: state.folders.find((item) => path.endsWith(`/${item.id}`)) });
    }
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

test.describe('Checklist library: one list of folders and checklists (PR 408)', () => {
  test('opens folders from the list, shows the path, searches the whole library, renames, moves and deletes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: { method: string; path: string; body: unknown }[] = [];
    const state = {
      folders: [folder('shop', null, 'Магазин', true), folder('till', 'shop', 'Касса'), folder('store', null, 'Склад')],
      sheets: [sheet('s1', 'Открытие смены', 'till'), sheet('s2', 'Уборка зала', 'shop'), sheet('s3', 'Без папки', null)],
    };
    await mockApi(page, state, calls);
    await page.goto('/admin/checklists');

    // There is no tree on the left: the root shows its folders above its checklists in one list.
    await expect(page.getByRole('tree')).toHaveCount(0);
    const table = page.getByRole('table');
    const rows = table.getByRole('row');
    await expect(rows.nth(1)).toContainText('Магазин');
    await expect(rows.nth(2)).toContainText('Склад');
    await expect(rows.nth(3)).toContainText('Без папки');
    await expect(page.getByText('Открытие смены')).toHaveCount(0);
    // A closed folder carries a lock with a text label; the assignments of a folder include its subfolders.
    await expect(table.getByRole('img', { name: /Закрытая папка/ })).toHaveCount(1);
    await expect(page.getByRole('row', { name: /Склад/ }).getByRole('cell', { name: '0', exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Магазин/ }).getByRole('cell', { name: '2', exact: true })).toBeVisible();

    // Opening a folder shows its subfolders and checklists, the path and the address.
    await table.getByRole('button', { name: 'Открыть папку: Магазин' }).click();
    await expect(page).toHaveURL(/folder=shop/);
    await expect(page.getByRole('row', { name: /Касса/ })).toBeVisible();
    await expect(page.getByText('Уборка зала')).toBeVisible();
    await expect(page.getByText('Без папки')).toHaveCount(0);
    const crumbs = page.getByRole('navigation', { name: 'Путь к папке' });
    await expect(crumbs.getByRole('button', { name: 'Все листы' })).toBeVisible();
    await expect(crumbs.getByText('Магазин')).toHaveAttribute('aria-current', 'page');
    await table.getByRole('button', { name: 'Открыть папку: Касса' }).click();
    await expect(page.getByText('Открытие смены')).toBeVisible();
    await crumbs.getByRole('button', { name: 'Магазин' }).click();
    await expect(page).toHaveURL(/folder=shop/);
    await page.goBack();
    await page.reload();
    await expect(page.getByText('Открытие смены')).toBeVisible();

    // A folder id that does not exist opens the root and says so.
    await page.goto('/admin/checklists?folder=missing');
    await expect(page.getByText('Папка скрыта или удалена. Показан корень.')).toBeVisible();
    await expect(page.getByText('Без папки')).toBeVisible();

    // The search covers the whole library and adds the folder path.
    await page.getByPlaceholder('Найти чек-лист').fill('смены');
    await expect(page.getByRole('row', { name: /Открытие смены/ })).toContainText('Магазин / Касса');
    await expect(page.getByText('Без папки')).toHaveCount(0);
    await page.getByPlaceholder('Найти чек-лист').fill('');

    // Rename a folder from its row menu.
    await page.getByRole('row', { name: /Склад/ }).getByRole('button', { name: /Действия с папкой: Склад/ }).click();
    await page.getByRole('menuitem', { name: 'Переименовать папку' }).click();
    await page.getByRole('dialog').getByLabel('Название папки').fill('Основной склад');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('row', { name: /Основной склад/ })).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ name: 'Основной склад', visibleToStaff: false });

    // Move a folder into another one (it and its subfolders are not offered as targets).
    await page.getByRole('row', { name: /Основной склад/ }).getByRole('button', { name: /Действия с папкой/ }).click();
    await page.getByRole('menuitem', { name: 'Переместить в папку…' }).click();
    const move = page.getByRole('dialog');
    await expect(move.getByRole('heading', { name: 'Переместить папку «Основной склад»' })).toBeVisible();
    await expect(move.getByRole('radio', { name: 'Основной склад' })).toHaveCount(0);
    await move.getByRole('radio', { name: 'Магазин' }).check();
    await move.getByRole('button', { name: 'Переместить' }).click();
    await expect(page.getByRole('row', { name: /Основной склад/ })).toHaveCount(0);
    expect(calls.filter((call) => call.path === '/checklist-folders/bulk').at(-1)?.body).toEqual({ action: 'move', ids: ['store'], parentId: 'shop' });

    // Create a subfolder of the open folder.
    await page.getByRole('row', { name: /Магазин/ }).getByRole('button', { name: 'Открыть папку: Магазин' }).click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Папку…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Создать папку' })).toBeVisible();
    await expect(dialog).toContainText('Папка будет создана в «Магазин».');
    await dialog.getByLabel('Название папки').fill('Подсобка');
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page.getByRole('row', { name: /Подсобка/ })).toBeVisible();
    await expect(page).toHaveURL(/folder=shop/);
    expect(calls.find((call) => call.path === '/checklist-folders' && call.method === 'POST')?.body).toEqual({ name: 'Подсобка', parentId: 'shop', visibleToStaff: false });

    // Move a sheet to a folder from the row menu.
    await page.getByRole('navigation', { name: 'Путь к папке' }).getByRole('button', { name: 'Все листы' }).click();
    const row = page.getByRole('row', { name: /Без папки/ });
    await row.getByRole('button', { name: 'Действия' }).click();
    await page.getByRole('menuitem', { name: 'Переместить в папку…' }).click();
    await page.getByRole('dialog').getByLabel('Касса').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Переместить' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Готово: 1, пропущено: 0' })).toBeVisible();
    expect(calls.find((call) => call.path === '/checklists/bulk')?.body).toEqual({ action: 'move', ids: ['s3'], folderId: 'till' });

    // Deleting a folder first states what goes with it.
    await page.getByRole('row', { name: /Магазин/ }).getByRole('button', { name: /Действия с папкой: Магазин/ }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Папок: 2');
    await expect(confirm).toContainText('чек-листов к удалению: 1');
    await confirm.getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(() => calls.some((call) => call.method === 'DELETE' && call.path === '/checklist-folders/shop')).toBe(true);
    await expect(page.getByRole('row', { name: /Магазин/ })).toHaveCount(0);
  });

  test('selects folders and a checklist together: select all, rename one folder, move the mix, delete with one confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: { method: string; path: string; body: unknown }[] = [];
    const state = {
      folders: [folder('a', null, 'Альфа', true), folder('b', null, 'Бета', true), folder('c', null, 'Гамма', true), folder('dest', null, 'Архив', true), folder('inner', 'a', 'Внутри', true)],
      sheets: [sheet('s1', 'Открытие', null)],
    };
    await mockApi(page, state, calls);
    await page.goto('/admin/checklists');
    const bar = page.getByRole('region', { name: /Выбрано/ });

    // One folder: the panel offers "Переименовать папку" and the other actions say they are not for folders.
    await page.getByRole('checkbox', { name: 'Выбрать папку: Альфа' }).check();
    await expect(bar.getByRole('button', { name: 'Переименовать папку' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
    await expect(bar.getByRole('button', { name: 'Опубликовать' })).toHaveAttribute('title', 'Недоступно для папок');
    await bar.getByRole('button', { name: 'Переименовать папку' }).click();
    await page.getByRole('dialog').getByLabel('Название папки').fill('Альфа 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('row', { name: /Альфа 2/ })).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({ name: 'Альфа 2' });
    await expect(bar).toHaveCount(0);

    // Select all rows of the open folder (folders and the checklist), then unselect the target folder.
    await page.getByRole('checkbox', { name: 'Выбрать все папки и листы в этой папке' }).check();
    await expect(bar).toContainText('5');
    await page.getByRole('checkbox', { name: 'Выбрать папку: Архив' }).uncheck();
    await expect(bar.getByRole('button', { name: 'Переименовать папку' })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Переместить в папку…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Переместить выбранное \(4\)/ })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Альфа 2' })).toHaveCount(0);
    await dialog.getByRole('radio', { name: 'Архив' }).check();
    await dialog.getByRole('button', { name: 'Переместить' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Готово: 4, пропущено: 0' })).toBeVisible();
    expect(calls.find((call) => call.path === '/checklists/bulk')?.body).toEqual({ action: 'move', ids: ['s1'], folderId: 'dest' });
    expect(calls.filter((call) => call.path === '/checklist-folders/bulk').at(-1)?.body).toEqual({ action: 'move', ids: ['a', 'b', 'c'], parentId: 'dest' });
    await expect(page.getByRole('row', { name: /Бета/ })).toHaveCount(0);

    // Open the destination, select two folders and delete them with one confirmation.
    await page.getByRole('button', { name: 'Открыть папку: Архив' }).click();
    await page.getByRole('checkbox', { name: 'Выбрать папку: Бета' }).check();
    await page.getByRole('checkbox', { name: 'Выбрать папку: Гамма' }).check();
    await bar.getByRole('button', { name: 'Удалить' }).click();
    const confirm = page.getByRole('dialog');
    // The mocked impact says 2 folders and 1 checklist per selected folder, summed over both.
    await expect(confirm).toContainText('Папок (со всем содержимым): 4, чек-листов: 2');
    await confirm.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Готово: 2, пропущено: 0' })).toBeVisible();
    expect(calls.filter((call) => call.path === '/checklist-folders/bulk').at(-1)?.body).toEqual({ action: 'delete', ids: ['b', 'c'] });
  });

  test('right button, keyboard and the move window: context menu on a folder, F2, Delete, the empty area and the folder list (PR 411)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: { method: string; path: string; body: unknown }[] = [];
    const state = {
      folders: [folder('a', null, 'Альфа', true), folder('b', null, 'Бета', true), folder('inner', 'a', 'Внутри', true)],
      sheets: [sheet('s1', 'Открытие', null)],
    };
    await mockApi(page, state, calls);
    await page.goto('/admin/checklists');

    // Right click on a folder: the menu names it, the row becomes the selection, "Переименовать папку" works.
    await page.getByRole('row', { name: /Альфа/ }).click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Действия: Альфа' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Открыть', 'Переименовать папку', 'Переместить в папку…', 'Удалить']);
    await expect(page.getByRole('checkbox', { name: 'Выбрать папку: Альфа' })).toBeChecked();
    await menu.getByRole('menuitem', { name: 'Переименовать папку' }).click();
    await page.getByRole('dialog').getByLabel('Название папки').fill('Альфа 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('row', { name: /Альфа 2/ })).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({ name: 'Альфа 2' });

    // Right click inside a selection of two rows acts on both; Open and Rename are not offered.
    await page.getByRole('checkbox', { name: 'Выбрать папку: Бета' }).check();
    await page.getByRole('checkbox', { name: 'Выбрать чек-лист: Открытие' }).check();
    await page.getByRole('row', { name: /Открытие/ }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: /Действия с выбранным \(2\)/ }).getByRole('menuitem')).toHaveText(['Переместить выбранное в папку…', 'Удалить выбранное…']);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // The empty area of the list: create a folder or a checklist.
    await page.getByRole('checkbox', { name: 'Выбрать папку: Бета' }).uncheck();
    await page.getByRole('checkbox', { name: 'Выбрать чек-лист: Открытие' }).uncheck();
    await page.mouse.click(10, 10);
    const box = (await page.getByRole('table', { name: 'Чек-листы' }).boundingBox())!;
    await page.mouse.click(box.x + 40, box.y + box.height + 40, { button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия со списком' }).getByRole('menuitem')).toHaveText(['Папку…', 'Чек-лист']);
    await page.keyboard.press('Escape');

    // Keyboard: focus a row, Shift+F10 opens the menu, arrows move, Escape returns the focus; F2 renames, Delete asks to delete.
    const row = page.getByRole('row', { name: /Бета/ });
    await row.focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: 'Открыть' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Переименовать папку' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
    await page.keyboard.press('F2');
    await expect(page.getByRole('dialog').getByLabel('Название папки')).toHaveValue('Бета');
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
    await row.focus();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toContainText('Бета');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The move window: the folder list has its own menu without "Удалить".
    await page.getByRole('row', { name: /Открытие/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Переместить в папку…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Бета', { exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия: Бета' }).getByRole('menuitem')).toHaveText(['Выбрать эту папку', 'Переименовать папку', 'Новая папка внутри']);
    await page.getByRole('menuitem', { name: 'Выбрать эту папку' }).click();
    await expect(dialog.getByRole('radio', { name: 'Бета' })).toBeChecked();
    await dialog.getByText('Бета', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Новая папка внутри' }).click();
    await page.getByRole('dialog', { name: 'Создать папку' }).getByLabel('Название папки').fill('Новая');
    await page.getByRole('dialog', { name: 'Создать папку' }).getByRole('button', { name: 'Создать' }).click();
    await expect(dialog.getByRole('radio', { name: 'Новая' })).toBeVisible();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/checklist-folders')?.body).toMatchObject({ name: 'Новая', parentId: 'b' });
    // Axe on the open context menu of the move window, then on the open menu of the list.
    await dialog.getByText('Бета', { exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия: Бета' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('row', { name: /Альфа 2/ }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия: Альфа 2' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
  });

  test('a skipped folder is reported with its reason', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApi(page, { folders: [folder('dup', null, 'Касса', true), folder('dest', null, 'Архив', true)], sheets: [] }, []);
    await page.goto('/admin/checklists');
    await page.getByRole('checkbox', { name: 'Выбрать папку: Касса' }).check();
    await page.getByRole('region', { name: /Выбрано/ }).getByRole('button', { name: 'Переместить в папку…' }).click();
    await page.getByRole('dialog').getByRole('radio', { name: 'Архив' }).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Переместить' }).click();
    const report = page.getByRole('status').filter({ hasText: 'Готово: 0, пропущено: 1' });
    await expect(report).toContainText('Папка «Касса»: папка с таким названием там уже есть');
  });

  test('"+ Создать" makes a folder, then a checklist inside it, and the checklist lands in that folder', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const calls: { method: string; path: string; body: unknown }[] = [];
    await mockApi(page, { folders: [], sheets: [] }, calls);
    await page.goto('/admin/checklists');
    const createButton = page.getByRole('button', { name: 'Создать', exact: true });
    await expect(createButton).toBeVisible();

    // The menu is keyboard operable and closes on Escape.
    await createButton.click();
    await expect(page.getByRole('menuitem', { name: 'Папку…' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Чек-лист' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // A folder is created in a small dialog and appears as a row; the user stays at the root.
    await createButton.click();
    await page.getByRole('menuitem', { name: 'Папку…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('верхнем уровне');
    await dialog.getByLabel('Название папки').fill('Новая смена');
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await createButton.click();
    await page.getByRole('menuitem', { name: 'Папку…' }).click();
    await page.getByRole('dialog').getByLabel('Название папки').fill('Новая смена');
    await page.getByRole('dialog').getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page.getByRole('row', { name: /Новая смена/ })).toBeVisible();
    expect(calls.filter((call) => call.path === '/checklist-folders' && call.method === 'POST')).toHaveLength(1);

    // Open it and create a checklist: the request names the open folder and the editor opens.
    await page.getByRole('button', { name: 'Открыть папку: Новая смена' }).click();
    await createButton.click();
    await page.getByRole('menuitem', { name: 'Чек-лист' }).click();
    await expect.poll(() => calls.find((call) => call.path === '/checklists' && call.method === 'POST')?.body).toMatchObject({ folderId: 'folder-1' });
    await expect(page.getByRole('button', { name: /Назад|Все чек-листы/ }).first()).toBeVisible();
  });

  test('on the fifth level the folder item is disabled and says why', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const chain = ['l1', 'l2', 'l3', 'l4', 'l5'].map((id, index) => folder(id, index === 0 ? null : `l${index}`, `Уровень ${index + 1}`, true));
    await mockApi(page, { folders: chain, sheets: [] }, []);
    await page.goto('/admin/checklists?folder=l5');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    const item = page.getByRole('menuitem', { name: 'Папку…' });
    await expect(item).toBeDisabled();
    await expect(page.getByRole('menu')).toContainText('не больше 5 уровней');
    await expect(page.getByRole('menuitem', { name: 'Чек-лист' })).toBeEnabled();
  });

  test('an empty folder says so, and on a narrow screen nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await mockApi(page, { folders: [folder('shop', null, 'Магазин', true), folder('till', 'shop', 'Касса')], sheets: [sheet('s1', 'Открытие смены', 'shop')] }, []);
    await page.goto('/admin/checklists?folder=till');
    await expect(page.getByText('В папке пока пусто. Создайте папку или чек-лист.')).toBeVisible();
    await page.goto('/admin/checklists');
    await expect(page.getByRole('tree')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

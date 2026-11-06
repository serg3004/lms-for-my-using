import { expect, test, type Locator, type Page } from '@playwright/test';

// PR 402: drag-and-drop of groups and criteria (mouse and keyboard), rollback on a failed save,
// and deleting a group with / without its criteria.
type Item = { id: string; checklistId: string; order: number; text: string; points: number; isRequired: boolean; photoRequired: boolean; groupId: string | null };
type Group = { id: string; checklistId: string; title: string; order: number };

const mkItem = (id: string, order: number, groupId: string | null): Item => ({ id, checklistId: 'checklist-1', order, text: `Критерий ${id}`, points: 10, isRequired: true, photoRequired: false, groupId });

type State = { groups: Group[]; items: Item[]; layouts: Array<Record<string, unknown>>; deletes: string[]; failLayout: boolean };

async function openEditor(page: Page, state: State) {
  const checklist = () => ({
    id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode: 'sum_points',
    passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    items: state.items, itemGroups: state.groups, contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/checklist-1/layout' && request.method() === 'PUT') {
      if (state.failLayout) return route.fulfill({ status: 500, json: { message: 'boom' } });
      const body = request.postDataJSON() as { groups: Array<{ id: string; itemIds: string[] }>; ungroupedItemIds: string[] };
      state.layouts.push(body);
      let order = 0;
      body.groups.forEach((group, index) => {
        state.groups.find((entry) => entry.id === group.id)!.order = index;
        for (const id of group.itemIds) Object.assign(state.items.find((entry) => entry.id === id)!, { groupId: group.id, order: order++ });
      });
      for (const id of body.ungroupedItemIds) Object.assign(state.items.find((entry) => entry.id === id)!, { groupId: null, order: order++ });
      return route.fulfill({ json: { groups: body.groups.length, items: order } });
    }
    const groupMatch = path.match(/^\/checklist-item-groups\/([^/]+)$/);
    if (groupMatch && request.method() === 'DELETE') {
      state.deletes.push(`${groupMatch[1]}:${url.searchParams.get('items')}`);
      return route.fulfill({ json: { deletedItems: 0, keptItems: 0 } });
    }
    if (path === '/checklists/checklist-1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    if (path === '/checklists/checklist-1/groups') return route.fulfill({ json: state.groups });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();
}

function seed(): State {
  return {
    groups: [
      { id: 'g1', checklistId: 'checklist-1', title: 'Группа 1', order: 0 },
      { id: 'g2', checklistId: 'checklist-1', title: 'Группа 2', order: 1 },
    ],
    items: [mkItem('a', 0, 'g1'), mkItem('b', 1, 'g1'), mkItem('c', 2, 'g2'), mkItem('d', 3, null)],
    layouts: [], deletes: [], failLayout: false,
  };
}

// A previous drop animates rows into place; measuring before it ends aims the next drag at stale positions.
async function settledBox(locator: Locator) {
  let previous = JSON.stringify(await locator.boundingBox());
  for (let attempt = 0; attempt < 40; attempt++) {
    await locator.page().waitForTimeout(100);
    const current = JSON.stringify(await locator.boundingBox());
    if (current === previous) break;
    previous = current;
  }
  return (await locator.boundingBox())!;
}

// dnd-kit reacts to pointer events asynchronously. On a slow runner the pointer can be released while its
// collision detection still reports the previous element (often the dragged row itself), so the drop lands
// on a neighbour or nowhere. Its live region announces what the item is over; the helper waits for the
// announcement to name the target and nudges the pointer while it does not.
const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]').evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join('|'));
const nameOfTarget = (target: Locator) => target.locator('[role="textbox"]').first().innerText();

async function drag(page: Page, handle: Locator, target: Locator, position: 'top' | 'bottom' = 'top') {
  const name = await nameOfTarget(target);
  // A pointer drag that never reaches the target is cancelled with Escape (nothing is saved) and retried.
  for (let drop = 0; drop < 3; drop++) {
    const from = await settledBox(handle);
    const to = await settledBox(target);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, position === 'top' ? to.y + 4 : to.y + to.height - 4, { steps: 20 });
    let announced = false;
    // Picking the row up and moving it between lists reflows the rows below, so aim at where the target is now.
    for (let attempt = 0; attempt < 15 && !announced; attempt++) {
      const box = (await target.boundingBox()) ?? to;
      const y = position === 'top' ? box.y + 4 : box.y + box.height - 4;
      await page.mouse.move(box.x + box.width / 2, y + (position === 'top' ? 1 : -1) + (attempt % 2), { steps: 3 });
      await page.waitForTimeout(100);
      announced = (await liveRegion(page)).includes(`над «${name}»`);
    }
    if (announced) {
      await page.waitForTimeout(150);
      await page.mouse.up();
      return;
    }
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  throw new Error(`the drag never reached «${name}»`);
}

const groupCard = (page: Page, title: string) => page.locator('.admin-group-card').filter({ has: page.getByRole('textbox', { name: 'Название группы' }).filter({ hasText: title }) });
const criterion = (page: Page, id: string) => page.locator('.admin-criteria-row').filter({ has: page.getByRole('button', { name: `Перетащить критерий: Критерий ${id}` }) });
const order = async (page: Page) => page.locator('.admin-criteria-row:not(.admin-criteria-row--head) [contenteditable].admin-criteria-row__text').evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').replace('Критерий ', '')));

test.describe('Checklist editor: drag-and-drop of groups and criteria (PR 402)', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1280, height: 2600 }); });

  test('a group is dragged above the first one and the new order is saved once', async ({ page }) => {
    const state = seed();
    await openEditor(page, state);
    await drag(page, groupCard(page, 'Группа 2').getByRole('button', { name: /Перетащить группу/ }), groupCard(page, 'Группа 1').locator('.admin-group-card__head'));
    await expect.poll(() => state.layouts.length).toBe(1);
    expect((state.layouts[0]!.groups as Array<{ id: string }>).map((group) => group.id)).toEqual(['g2', 'g1']);
    await expect.poll(() => order(page)).toEqual(['c', 'a', 'b', 'd']);
  });

  test('a criterion is dragged within its group', async ({ page }) => {
    const state = seed();
    await openEditor(page, state);
    await drag(page, criterion(page, 'b').getByRole('button', { name: /Перетащить критерий/ }), criterion(page, 'a'));
    await expect.poll(() => state.layouts.length).toBe(1);
    expect((state.layouts[0]!.groups as Array<{ id: string; itemIds: string[] }>)[0]).toEqual({ id: 'g1', itemIds: ['b', 'a'] });
    await expect.poll(() => order(page)).toEqual(['b', 'a', 'c', 'd']);
  });

  test('a criterion moves to another group and out of any group', async ({ page }) => {
    const state = seed();
    await openEditor(page, state);
    await drag(page, criterion(page, 'a').getByRole('button', { name: /Перетащить критерий/ }), criterion(page, 'c'));
    await expect.poll(() => state.layouts.length).toBe(1);
    const [first, second] = (state.layouts[0]!.groups as Array<{ id: string; itemIds: string[] }>).map((group) => group.itemIds);
    expect(first).toEqual(['b']);
    expect([...second!].sort()).toEqual(['a', 'c']);
    await expect(groupCard(page, 'Группа 2').locator('.admin-criteria-row:not(.admin-criteria-row--head)')).toHaveCount(2);

    // "Без группы" accepts a criterion that is dragged onto it.
    await drag(page, criterion(page, 'b').getByRole('button', { name: /Перетащить критерий/ }), criterion(page, 'd'));
    await expect.poll(() => state.layouts.length).toBe(2);
    expect(state.layouts[1]!.ungroupedItemIds).toContain('b');
  });

  test('the keyboard moves a criterion down and ↑/↓ buttons still work', async ({ page }) => {
    const state = seed();
    await openEditor(page, state);
    await criterion(page, 'a').getByRole('button', { name: /Перетащить критерий/ }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    // Feedback has its own sorting contexts; assert the criterion announcement among their live regions.
    await expect(page.locator('[id^="DndLiveRegion"]').filter({ hasText: '«Критерий a» над «Критерий b».' })).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect.poll(() => state.layouts.length).toBe(1);
    expect((state.layouts[0]!.groups as Array<{ id: string; itemIds: string[] }>)[0]!.itemIds).toEqual(['b', 'a']);
    await expect(criterion(page, 'a').getByRole('button', { name: /Переместить вверх/ })).toBeEnabled();
  });

  test('a failed save restores the previous order and shows an error', async ({ page }) => {
    const state = seed();
    state.failLayout = true;
    await openEditor(page, state);
    await drag(page, criterion(page, 'b').getByRole('button', { name: /Перетащить критерий/ }), criterion(page, 'a'));
    await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить новый порядок' })).toBeVisible();
    expect(await order(page)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('deleting a group asks how many criteria go with it and can keep them', async ({ page }) => {
    const state = seed();
    await openEditor(page, state);
    await groupCard(page, 'Группа 1').getByRole('button', { name: /Удалить группу/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Удалить группу «Группа 1» и 2 критериев?');
    await dialog.getByLabel(/Удалить только группу/).check();
    await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect.poll(() => state.deletes).toEqual(['g1:keep']);
    await expect(page.locator('.admin-group-card').getByRole('textbox', { name: 'Название группы' }).filter({ hasText: 'Группа 1' })).toHaveCount(0);
    await expect.poll(() => order(page)).toEqual(expect.arrayContaining(['a', 'b']));

    await groupCard(page, 'Группа 2').getByRole('button', { name: /Удалить группу/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect.poll(() => state.deletes).toEqual(['g1:keep', 'g2:delete']);
    await expect.poll(() => order(page)).not.toContain('c');
  });

  test('handles are touch-sized and nothing overflows on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await openEditor(page, seed());
    const box = (await criterion(page, 'a').getByRole('button', { name: /Перетащить критерий/ }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

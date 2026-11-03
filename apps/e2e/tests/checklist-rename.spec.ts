import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// PR 413: groups, criteria, "General information" fields and the feedback block are renamed in place, with a visible result.
type Server = { calls: { method: string; path: string; body: unknown }[]; failNext: number; groups: { id: string; checklistId: string; title: string; order: number }[]; contextFields: unknown[] | null };

async function openEditor(page: Page): Promise<Server> {
  const server: Server = {
    calls: [], failNext: 0, contextFields: null,
    groups: [
      { id: 'g1', checklistId: 'c1', title: 'Зал', order: 1 },
      { id: 'g2', checklistId: 'c1', title: 'Касса', order: 2 },
    ],
  };
  const items = [
    { id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g1' },
    { id: 'i2', checklistId: 'c1', order: 2, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g2' },
  ];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: server.groups, contextFields: server.contextFields,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (method !== 'GET') {
      const body = request.postDataJSON() as Record<string, unknown>;
      server.calls.push({ method, path, body });
      if (server.failNext > 0) { server.failNext -= 1; return route.fulfill({ status: 500, json: { message: 'Сервер недоступен' } }); }
      if (/^\/checklist-item-groups\/[^/]+$/.test(path)) {
        const group = server.groups.find((entry) => path.endsWith(`/${entry.id}`))!;
        Object.assign(group, body);
        return route.fulfill({ json: group });
      }
      if (/^\/checklist-items\/[^/]+$/.test(path)) {
        const item = items.find((entry) => path.endsWith(`/${entry.id}`))!;
        Object.assign(item, body);
        return route.fulfill({ json: item });
      }
      if (path === '/checklists/c1') {
        if ('contextFields' in body) server.contextFields = body.contextFields as unknown[] | null;
        return route.fulfill({ json: checklist() });
      }
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: server.groups });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();
  return server;
}

test.describe('Rename in the checklist editor (PR 413)', () => {
  test('"Переименовать" selects the group title; Enter saves it with a visible "Сохранено"; Esc cancels', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByRole('button', { name: 'Переименовать группу: Зал' }).click();
    const title = page.getByRole('textbox', { name: 'Название группы' }).first();
    await expect(title).toBeFocused();
    expect(await title.evaluate((node: HTMLInputElement) => node.selectionEnd! - node.selectionStart!)).toBe(3);
    await page.keyboard.type('Торговый зал');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' }).first()).toBeVisible();
    expect(server.calls.find((call) => call.path === '/checklist-item-groups/g1')?.body).toEqual({ title: 'Торговый зал' });
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toHaveCount(0, { timeout: 6000 });

    await title.click();
    await page.keyboard.type(' лишнее');
    await page.keyboard.press('Escape');
    await expect(title).toHaveValue('Торговый зал');
    expect(server.calls.filter((call) => call.path === '/checklist-item-groups/g1')).toHaveLength(1);
  });

  test('an empty, a duplicate and a failed save are explained next to the field and keep the text', async ({ page }) => {
    const server = await openEditor(page);
    const title = page.getByRole('textbox', { name: 'Название группы' }).first();
    await title.fill('');
    await title.blur();
    await expect(page.getByRole('status').filter({ hasText: 'Укажите название' })).toBeVisible();
    await title.fill('касса');
    await title.blur();
    await expect(page.getByRole('status').filter({ hasText: 'Группа с таким названием уже есть' })).toBeVisible();
    expect(server.calls).toHaveLength(0);

    await title.fill('Парковка');
    server.failNext = 1;
    await title.blur();
    await expect(page.getByRole('status').filter({ hasText: 'Сервер недоступен' })).toBeVisible();
    await expect(title).toHaveValue('Парковка');
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' }).first()).toBeVisible();
    expect(server.groups[0]!.title).toBe('Парковка');
  });

  test('a criterion is renamed from its row menu and a double click selects its text', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByRole('row', { name: /Включить свет/ }).getByRole('button', { name: 'Действия' }).click();
    await page.getByRole('menuitem', { name: 'Переименовать' }).click();
    const text = page.getByRole('textbox', { name: 'Критерий' }).first();
    await expect(text).toBeFocused();
    await page.keyboard.type('Включить свет в зале');
    await page.keyboard.press('Enter');
    await expect.poll(() => server.calls.find((call) => call.path === '/checklist-items/i1')?.body).toEqual({ text: 'Включить свет в зале' });
    await text.dblclick();
    expect(await text.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(0);
  });

  test('the right button on a group opens a menu with "Переименовать"', async ({ page }) => {
    await openEditor(page);
    await page.locator('.admin-group-card__head').first().click({ button: 'right', position: { x: 4, y: 4 } });
    const menu = page.getByRole('menu', { name: 'Действия: Зал' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Переименовать', 'Копировать', 'Удалить']);
    await menu.getByRole('menuitem', { name: 'Переименовать' }).click();
    await expect(page.getByRole('textbox', { name: 'Название группы' }).first()).toBeFocused();
  });

  test('a new "General information" field says it needs a name, is not sent empty, and is saved once named', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByRole('button', { name: '+ Поле' }).click();
    const label = page.getByRole('textbox', { name: 'Название поля' }).first();
    await expect(label).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Укажите название' }).first()).toBeVisible();
    expect(server.calls.filter((call) => call.path === '/checklists/c1')).toHaveLength(0);
    await page.keyboard.type('Смена');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Сохранено' }).first()).toBeVisible();
    expect(server.contextFields).toMatchObject([{ label: 'Смена' }]);
  });

  test('feedback: the section heading follows its name and erasing a built-in field name does not bring the default back', async ({ page }) => {
    await openEditor(page);
    const section = page.getByLabel('Название раздела обратной связи');
    await section.fill('Итоги наблюдения');
    await expect(page.getByRole('heading', { name: 'Итоги наблюдения' })).toBeVisible();
    const field = page.getByLabel('Название поля', { exact: true }).first();
    await field.click();
    await field.fill('');
    await expect(field).toHaveValue('');
    await field.fill('Зоны');
    await expect(field).toHaveValue('Зоны');
    await field.fill('');
    await field.blur();
    await expect(field).toHaveValue('Сильные стороны');
    await page.locator('.admin-feedback-block').getByRole('button', { name: 'Переименовать', exact: true }).first().click();
    await expect(section).toBeFocused();
  });

  test('has no axe violations with the rename states and the context menu open', async ({ page }) => {
    await openEditor(page);
    const title = page.getByRole('textbox', { name: 'Название группы' }).first();
    await title.fill('');
    await title.blur();
    await page.locator('.admin-group-card__head').first().click({ button: 'right', position: { x: 4, y: 4 } });
    await expect(page.getByRole('menu')).toBeVisible();
    // The criteria table's own ARIA structure (PR 403) is outside this PR: the scan covers the group header, the fields and the menu.
    const result = await new AxeBuilder({ page }).include('.admin-group-card__head').include('.admin-context-fields').include('[role="menu"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
});

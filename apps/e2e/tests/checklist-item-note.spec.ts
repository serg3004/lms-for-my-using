import { fillRich } from '../fixtures/rich-fill.js';
import { expect, test, type Page } from '@playwright/test';

// PR 415: a criterion's description and explanation rule, in the editor and while filling the sheet.
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
    { id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g1', scaleId: null as string | null },
    { id: 'i2', checklistId: 'c1', order: 2, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: 'g2', scaleId: 's1' as string | null },
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
    if (path === '/checklist-scales') return route.fulfill({ json: [{ id: 's1', organizationId: 'org', name: 'Да/Нет', status: 'active', isDefault: true, levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 10 }] }] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();
  return server;
}


test.describe('Criterion description and explanation (PR 415)', () => {
  test('the editor saves the description and the rule, and the row tells what is set', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByRole('button', { name: 'Действия' }).first().click();
    await page.getByRole('menuitem', { name: 'Описание и пояснение…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Критерий: описание и пояснение' });
    await dialog.getByRole('switch').check();
    await dialog.getByRole('textbox').fill('Ценники совпадают с кассой');
    await dialog.getByRole('combobox').selectOption('on_answers');
    await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    await dialog.getByLabel('Не выполнено', { exact: true }).check();
    await dialog.getByLabel(/Пояснение обязательно/).check();
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog).toBeHidden();
    expect(server.calls.find((call) => call.path === '/checklist-items/i1')?.body).toEqual({
      descriptionEnabled: true, description: 'Ценники совпадают с кассой', noteRule: 'on_answers', noteAnswers: ['unchecked'], noteRequired: true,
    });
    await expect(page.getByText('Описание · Пояснение: Не выполнено · обязательно')).toBeVisible();
  });
});

test.describe('Explanation while filling a sheet (PR 415)', () => {
  test('an answer that needs a required explanation waits for it, then both are saved together', async ({ page }) => {
    const scale = { id: 's1', name: 'Да/Нет', levels: [{ value: 1, label: 'Нет', score: 0 }, { value: 2, label: 'Да', score: 10 }] };
    const item = { id: 'i1', checklistId: 'c1', order: 1, text: 'Витрина выставлена', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, scaleId: 's1', scale, groupId: null,
      description: 'Ценники совпадают с кассой', descriptionEnabled: true, noteRule: 'on_answers', noteAnswers: ['1'], noteRequired: true };
    const posts: unknown[] = [];
    let result: Record<string, unknown> | null = null;
    const instance = () => ({
      id: 'inst1', organizationId: 'org', checklistId: 'c1', userId: 'learner', assignedBy: null, reviewerId: null, status: 'in_progress', totalScore: 0, maxScore: 10, percentage: 0, passed: false, scored: true,
      dueAt: null, createdAt: '2026-11-03T08:00:00.000Z', updatedAt: '2026-11-03T08:00:00.000Z',
      checklist: { id: 'c1', title: 'Обход зала', description: null, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 70, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [item] },
      results: result ? [result] : [],
    });
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const method = route.request().method();
      if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklist-instances/mine') return route.fulfill({ json: [instance()] });
      if (path === '/checklists/free') return route.fulfill({ json: [] });
      if (path === '/checklist-instances/inst1/items/i1' && method === 'PATCH') {
        const body = route.request().postDataJSON() as { scaleLevel: number; comment: string };
        posts.push(body);
        result = { id: 'r1', itemId: 'i1', checked: false, scaleLevel: body.scaleLevel, points: 0, photoUrl: null, photoFileName: null, comment: body.comment ?? null, answerState: 'answered', reviewStatus: 'pending' };
        return route.fulfill({ json: instance() });
      }
      return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.goto('/learn/checklists');
    await page.getByText('Обход зала').click();

    await page.getByText('Описание', { exact: true }).click();
    await expect(page.getByText('Ценники совпадают с кассой')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Пояснение/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Да', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ scaleLevel: 2 });
    await expect(page.getByRole('textbox', { name: /Пояснение/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Нет', exact: true }).click();
    expect(posts).toHaveLength(1);
    const note = page.getByRole('textbox', { name: 'Пояснение (обязательно)' });
    await expect(note).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить пояснение' })).toBeDisabled();
    await fillRich(page, note, 'Нет ценников');
    await page.getByRole('button', { name: 'Сохранить пояснение' }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[1]).toEqual({ scaleLevel: 1, comment: 'Нет ценников' });
  });

  for (const width of [1280, 390, 320]) {
    test(`PR 443: boxes and switches stand right before their captions at ${width} px`, async ({ page }) => {
      await openEditor(page);
      await page.setViewportSize({ width, height: 1400 });
      await page.getByRole('button', { name: 'Действия' }).first().click();
      await page.getByRole('menuitem', { name: 'Описание и пояснение…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Критерий: описание и пояснение' });
      await dialog.getByRole('switch').check();
      await dialog.getByRole('combobox').selectOption('on_answers');
      const rows = await dialog.locator('label:has(input[type="checkbox"])').evaluateAll((labels) => labels.map((label) => {
        const box = label.querySelector('input')!.getBoundingClientRect();
        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
        const range = document.createRange(); range.selectNodeContents(walker.nextNode()!);
        const text = range.getBoundingClientRect();
        return { boxWidth: box.width, gap: text.left - box.right, height: label.getBoundingClientRect().height, boxTop: box.top, textTop: text.top };
      }));
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.boxWidth).toBeLessThanOrEqual(40);
        expect(row.gap).toBeGreaterThanOrEqual(0);
        expect(row.gap).toBeLessThanOrEqual(16);
        expect(row.height).toBeGreaterThanOrEqual(43.5);
        expect(Math.abs(row.boxTop - row.textTop)).toBeLessThanOrEqual(6);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

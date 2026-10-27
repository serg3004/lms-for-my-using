import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { ChecklistInstanceSummary, ChecklistItemResultSummary, ChecklistSessionSummary } from '../../web/src/shared/api/types.js';

const first = 'Observe the greeting';
const second = 'Already answered criterion';
const third = 'Explicitly skipped criterion';
const fourth = 'Final unanswered criterion';
async function setup(page: Page, options: { hold?: 'answer' | 'photo' | 'feedback' | 'context'; photo?: boolean; context?: boolean; allowIncomplete?: boolean; rejectAnswer?: boolean } = {}) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  const result = (itemId: string, extra: Partial<ChecklistItemResultSummary> = {}): ChecklistItemResultSummary => ({ id: `result-${itemId}`, itemId, checked: false, scaleLevel: null, points: 0, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'unanswered', ...extra });
  const instance: ChecklistInstanceSummary = {
    id: 'instance', organizationId: 'org', checklistId: 'sheet', userId: 'learner', assignedBy: 'observer', reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null,
    status: 'in_progress', totalScore: 0, maxScore: 10, percentage: 0, passed: false, dueAt: null, submittedAt: null, completedAt: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
    checklist: { id: 'sheet', organizationId: 'org', title: 'Observation sheet', description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'observer', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
      allowFinishIncomplete: options.allowIncomplete === true,
      contextFields: options.context ? [{ id: 'workplace', label: 'Workplace', required: true, type: 'text', order: 0 }] : [],
      itemGroups: [{ id: 'group-a', checklistId: 'sheet', title: 'Greeting', order: 0 }, { id: 'group-b', checklistId: 'sheet', title: 'Checks', order: 1 }],
      items: [first, second, third, fourth].map((text, index) => ({ id: `item-${index + 1}`, checklistId: 'sheet', order: index, text, points: 10, isRequired: index === 0, photoRequired: index === 0 && options.photo === true, allowSkip: index > 0, groupId: index < 2 ? 'group-a' : index === 2 ? 'group-b' : null })),
    },
    results: [result('item-2', { checked: true, answerState: 'answered' }), result('item-3', { answerState: 'skipped' })],
  };
  const session: ChecklistSessionSummary = { id: 'session', organizationId: 'org', instanceId: 'instance', observerId: 'observer', status: 'in_progress', version: 1, scheduledAt: null, durationMinutes: null, startedAt: '2026-10-01T12:00:00Z', pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false, strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', checklist: { id: 'sheet', title: 'Observation sheet' }, learner: { id: 'learner', firstName: 'Alex', lastName: 'Learner', email: 'self@example.invalid' }, observer: { id: 'observer', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' }, result: { instanceStatus: 'in_progress', visible: true, scored: false, passed: false, percentage: null } };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'observer', organizationId: 'org', email: 'observer@example.invalid', firstName: 'Olga', lastName: 'Observer', roles: ['instructor'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklist-sessions/session') return route.fulfill({ json: session });
    if (path === '/checklist-instances/instance') return route.fulfill({ json: instance });
    if (path.startsWith('/checklist-instances/instance/items/')) {
      const itemId = path.split('/')[4]!;
      const kind = path.endsWith('/photo') ? 'photo' : 'answer';
      calls.push(kind);
      if (options.hold === kind) await gate;
      if (options.rejectAnswer) return route.fulfill({ status: 500, json: { message: 'Save unavailable' } });
      const body = kind === 'photo' ? { photoFileName: 'evidence.png' } : route.request().postDataJSON();
      const old = instance.results.find((row) => row.itemId === itemId) ?? result(itemId);
      const updated = { ...old, ...body, ...(body.checked !== undefined || body.scaleLevel !== undefined ? { answerState: 'answered' as const } : {}) };
      instance.results = [...instance.results.filter((row) => row.itemId !== itemId), updated];
      return route.fulfill({ json: instance });
    }
    if ((method === 'POST' || method === 'PATCH') && path.startsWith('/checklist-sessions/session/')) {
      const action = path.split('/').at(-1)!;
      calls.push(action);
      if (options.hold === action) await gate;
      const body = route.request().postDataJSON();
      if (action === 'feedback') Object.assign(session, { strengths: body.strengths, developmentAreas: body.developmentAreas, nextSteps: body.nextSteps });
      else if (action === 'context') Object.assign(session, { contextValues: body.values });
      else session.status = action === 'pause' ? 'paused' : action === 'resume' ? 'in_progress' : 'completed';
      session.version++;
      return route.fulfill({ json: session });
    }
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.clock.setFixedTime(new Date('2026-10-01T12:05:00.000Z'));
  await page.goto('/instructor/checklists/sessions/session');
  await expect(page.getByRole('button', { name: 'Обзор листа', exact: true })).toBeVisible();
  return { release, calls, session, instance };
}
const overview = (page: Page) => page.getByRole('region', { name: 'Обзор листа', exact: true });
async function select(page: Page, text: string) {
  await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
  await overview(page).getByRole('button', { name: new RegExp(text) }).click();
  await expect(overview(page)).toBeHidden();
}
async function next(page: Page) { await page.getByRole('button', { name: 'Далее', exact: true }).click(); }
async function assertLocked(page: Page) {
  for (const name of ['Обзор листа', 'Назад', 'Пауза']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true })).toBeDisabled();
}

test.describe('conduct sheet overview (PR 347)', () => {
  test.use({ viewport: { width: 375, height: 900 } });
  test('exposes grouped text statuses and keyboard navigation, preserves drafts and filter across pause/resume', async ({ page }) => {
    const requests = await setup(page);
    await page.getByLabel('Комментарий', { exact: true }).fill('Unsaved first comment');
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page)).toContainText('Обработано 2 из 4');
    for (const text of ['Greeting', 'Checks', 'Другие критерии', 'Отвечен', 'Пропущен', 'Не отвечен']) await expect(overview(page)).toContainText(text);
    const target = overview(page).getByRole('button', { name: new RegExp(fourth) });
    await target.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Критерий 4 / 4', { exact: true })).toBeFocused();
    await page.getByLabel('Комментарий', { exact: true }).fill('Unsaved last comment');
    await next(page);
    await page.getByLabel('Сильные стороны', { exact: true }).fill('Unsaved feedback');
    await expect(page.getByText('Неотвеченных критериев: 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'К первому неотвеченному', exact: true }).click();
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Unsaved first comment');
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).check();
    await next(page);
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Unsaved last comment');
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Unsaved last comment');
    await next(page);
    await expect(page.getByLabel('Сильные стороны', { exact: true })).toHaveValue('Unsaved feedback');
    expect(requests.calls).toEqual(['pause', 'resume']);
    await select(page, first);
    await page.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
    await expect.poll(() => requests.instance.results.find((row) => row.itemId === 'item-1')?.comment).toBe('Unsaved first comment');
    await select(page, fourth);
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Unsaved last comment');
  });

  test('keeps navigation locked during an answer save and uses the saved state on Next', async ({ page }) => {
    const requests = await setup(page, { hold: 'answer' });
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Выполнено', exact: true }).click();
    await expect.poll(() => requests.calls).toContain('answer');
    await assertLocked(page);
    await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
    requests.release();
    await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeEnabled();
    await next(page);
    await expect(page.getByText(fourth, { exact: true })).toBeVisible();
    await next(page);
    await expect(page.getByText('Неотвеченных критериев: 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
  });

  test('shows an empty filtered overview when all criteria are addressed and keeps feedback reachable', async ({ page }) => {
    await setup(page);
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Выполнено', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Выполнено', exact: true })).toBeChecked();
    await next(page);
    await expect(page.getByText(fourth, { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Выполнено', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Выполнено', exact: true })).toBeChecked();
    await next(page);
    await expect(page.getByRole('button', { name: 'К первому неотвеченному', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page)).toContainText('Обработано 4 из 4');
    await expect(overview(page)).toContainText('Неотвеченных критериев нет.');
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).uncheck();
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toBeVisible();
  });

  test('keeps a draft after failed autosave and unlocks overview without changing status', async ({ page }) => {
    await setup(page, { rejectAnswer: true });
    await page.getByLabel('Комментарий', { exact: true }).fill('Keep me after failure');
    await page.getByRole('checkbox', { name: 'Выполнено', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await select(page, fourth);
    await select(page, first);
    await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Keep me after failure');
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page)).toContainText('Обработано 2 из 4');
  });

  test('preserves photo upload navigation locks and does not hide a criterion missing evidence', async ({ page }) => {
    const requests = await setup(page, { photo: true, hold: 'photo' });
    await page.getByRole('checkbox', { name: 'Выполнено', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Обзор листа', exact: true })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).check();
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toBeVisible();
    await overview(page).getByRole('button', { name: new RegExp(first) }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    await expect.poll(() => requests.calls).toContain('photo');
    await assertLocked(page);
    requests.release();
    await expect(page.getByRole('button', { name: 'Далее', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toHaveCount(0);
  });

  test('preserves required context validation and saves context before an overview jump', async ({ page }) => {
    const requests = await setup(page, { context: true, hold: 'context' });
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toBeDisabled();
    await overview(page).getByRole('button', { name: 'Вернуться к текущему шагу', exact: true }).click();
    await page.getByLabel('Workplace', { exact: false }).fill('Desk A');
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    await overview(page).getByRole('button', { name: new RegExp(fourth) }).click();
    await expect.poll(() => requests.calls).toContain('context');
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toBeDisabled();
    requests.release();
    await expect(overview(page)).toBeHidden();
    await expect(page.getByText(fourth, { exact: true })).toBeVisible();
    expect(requests.session.contextValues).toEqual({ workplace: 'Desk A' });
  });

  test('locks overview/back/completion while feedback is saved and explains incomplete completion', async ({ page }) => {
    const requests = await setup(page, { allowIncomplete: true, hold: 'feedback' });
    await select(page, fourth); await next(page);
    await expect(page.getByText('Неотвеченных критериев: 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Критерии, на которые вы не ответили, будут записаны как пропущенные и не войдут в результат.', { exact: true })).toBeVisible();
    await page.getByLabel('Сильные стороны', { exact: true }).fill('Saved feedback');
    await page.getByRole('button', { name: 'Сохранить обратную связь', exact: true }).click();
    await expect.poll(() => requests.calls).toContain('feedback');
    await assertLocked(page);
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeDisabled();
    requests.release();
    await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Сильные стороны', { exact: true })).toHaveValue('Saved feedback');
  });

  for (const width of [320, 375, 768]) test(`overview remains accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await testInfo.attach(`overview-${width}`, { body: await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true }), contentType: 'image/png' });
    await page.getByRole('checkbox', { name: 'Скрыть отвеченное', exact: true }).check();
    await expect(overview(page).getByRole('button', { name: new RegExp(second) })).toHaveCount(0);
    await expect(overview(page).getByRole('button', { name: new RegExp(third) })).toHaveCount(0);
    await expect(overview(page).getByRole('button', { name: new RegExp(first) })).toBeVisible();
  });
});

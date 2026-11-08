import { expect, test } from '@playwright/test';

// PR 406б: a self-filled sheet ends with an explicit "Finish the check", not with the last answer.
test.describe('self-filled checklist is finished explicitly (PR 406б)', () => {
  for (const showPointsToLearner of [false, true]) test(`finish stays disabled until required answers, confirms, and applies points visibility: ${showPointsToLearner}`, async ({ page }) => {
    const item = { id: 'i1', checklistId: 'c1', order: 1, text: 'Проверить кассу', points: 10, isRequired: true, photoRequired: false, weight: 1, allowSkip: false, autoSkipUnanswered: false, scaleId: null, groupId: null, scale: null };
    const state = { status: 'in_progress', checked: false, finishCalls: 0 };
    const instance = () => ({
      id: 'inst1', organizationId: 'org', checklistId: 'c1', userId: 'learner', assignedBy: null, reviewerId: null, status: state.status,
      totalScore: state.status === 'completed' ? 10 : 0, maxScore: 10, percentage: state.status === 'completed' ? 100 : 0, passed: state.status === 'completed', scored: true,
      dueAt: null, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z',
      checklist: { id: 'c1', title: 'Открытие смены', description: null, showPointsToLearner, scoringMode: 'sum_points', scaleLevels: null, requiresReview: false, passThreshold: 70, forbidGalleryPhotos: false, allowFinishIncomplete: false, contextFields: [], itemGroups: [], items: [item] },
      results: state.checked ? [{ id: 'r1', itemId: 'i1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: null, answerState: 'answered', reviewStatus: 'pending' }] : [],
    });
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const method = route.request().method();
      if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklist-instances/mine') return route.fulfill({ json: [instance()] });
      if (path === '/checklists/free') return route.fulfill({ json: [] });
      if (path === '/checklist-instances/inst1/items/i1' && method === 'PATCH') { state.checked = true; return route.fulfill({ json: instance() }); }
      if (path === '/checklist-instances/inst1/finish' && method === 'POST') { state.finishCalls += 1; state.status = 'completed'; return route.fulfill({ json: instance() }); }
      return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.goto('/learn/checklists');
    await page.getByText('Открытие смены').click();

    const finish = page.getByRole('button', { name: 'Завершить проверку' });
    await expect(finish).toBeDisabled();
    await expect(page.getByText('Осталось ответить: 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Ещё нет ответа')).toHaveCount(0);
    await expect(finish).toHaveAccessibleDescription('Осталось ответить: 1');

    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    await expect(finish).toBeEnabled();
    // the last answer did not finish the sheet
    expect(state.status).toBe('in_progress');

    await finish.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('После завершения изменить ответы нельзя.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Завершить проверку' }).click();
    await expect.poll(() => state.finishCalls).toBe(1);
    if (showPointsToLearner) await expect(page.getByText('10 / 10 (100%)', { exact: true })).toBeVisible();
    else { await expect(page.getByText('100%', { exact: true })).toBeVisible(); await expect(page.getByText('10 / 10 (100%)', { exact: true })).toHaveCount(0); }
    await expect(page.getByRole('button', { name: 'Завершить проверку' })).toHaveCount(0);
  });
});

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { ChecklistSessionSummary } from '../../web/src/shared/api/types.js';
import { sessionReportFixture } from '../fixtures/session-report.js';

function sessionSummary(percentage: number): ChecklistSessionSummary {
  return {
    id: 'session-1', organizationId: 'org-1', instanceId: 'instance-1', observerId: 'observer-1', status: 'completed', version: 3,
    scheduledAt: null, durationMinutes: null, startedAt: null, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
    strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null, observerUnavailableAt: null,
    createdAt: '2026-10-25T08:00:00.000Z', updatedAt: '2026-10-25T08:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Unequal criteria' }, learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'completed', percentage, passed: percentage >= 80, scored: true, visible: true },
  };
}

async function report(page: Page, failFirst = false) {
  const calls: Array<{ reason: string; formula: string; idempotencyKey: string }> = [];
  const revisions: Array<Record<string, unknown>> = [];
  let percentage = 95;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin-1', organizationId: 'org-1', firstName: 'Test', lastName: 'Admin', email: 'admin@example.invalid', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['admin'] } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklist-sessions/session-1/recalculate') {
      const body = route.request().postDataJSON() as typeof calls[number];
      calls.push(body);
      let revision = revisions.find((item) => item.key === body.idempotencyKey);
      if (!revision) {
        const next = body.formula === 'criteria' ? 50 : 95;
        revision = { key: body.idempotencyKey, id: `revision-${revisions.length + 1}`, organizationId: 'org-1', instanceId: 'instance-1', formula: body.formula,
          previousPercentage: percentage, newPercentage: next, previousPassed: percentage >= 80, newPassed: next >= 80,
          newScored: true, scored: true, reason: body.reason, actorUserId: 'admin-1', createdAt: '2026-10-25T09:00:00.000Z' };
        revisions.push(revision); percentage = next;
      }
      if (failFirst && calls.length === 1) return route.fulfill({ status: 503, json: { message: 'Response lost after commit' } });
      return route.fulfill({ json: revision });
    }
    if (path.endsWith('/score-revisions')) return route.fulfill({ json: revisions });
    if (path.endsWith('/events') || path.endsWith('/location')) return route.fulfill({ json: [] });
    if (path === '/checklist-sessions/session-1/report') return route.fulfill({ json: sessionReportFixture(sessionSummary(percentage)) });
    if (path === '/checklist-sessions/session-1') return route.fulfill({ json: sessionSummary(percentage) });
    if (path === '/checklist-instances/instance-1') return route.fulfill({ json: {
      id: 'instance-1', organizationId: 'org-1', checklistId: 'checklist-1', userId: 'learner-1', status: 'completed',
      percentage, passed: percentage >= 80, totalScore: 180, maxScore: 190, scored: true, results: [],
      checklist: { id: 'checklist-1', title: 'Unequal criteria', scoringMode: 'sum_points', items: [], contextFields: [] },
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/admin/checklists/sessions/session-1');
  await page.getByRole('button', { name: 'Пересчитать', exact: true }).click();
  return { calls, revisions };
}

for (const width of [320, 390]) {
  test(`failed retries replay once and successful recalculations start new operations at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const { calls, revisions } = await report(page, true);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('combobox', { name: 'Формула', exact: true })).toHaveValue('snapshot');
    await expect(dialog.getByRole('button', { name: 'Пересчитать балл' })).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Формула', exact: true }).selectOption('criteria');
    await dialog.getByLabel('Причина пересчёта').fill('  Equal criteria audit  ');
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(audit.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    await testInfo.attach('recalculation-formula-mobile', { body: await page.screenshot({ path: testInfo.outputPath('recalculation-formula-mobile.png'), fullPage: true }), contentType: 'image/png' });
    await dialog.getByRole('button', { name: 'Пересчитать балл' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Response lost after commit');
    await dialog.getByRole('button', { name: 'Пересчитать балл' }).click();
    await expect(dialog).toContainText('95% → 50%');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]).toMatchObject({ reason: 'Equal criteria audit', formula: 'criteria' });
    expect(revisions).toHaveLength(1);
    // A completed calculation is a new intent even if the reason/formula are unchanged.
    await dialog.getByLabel('Причина пересчёта').fill('Equal criteria audit');
    await dialog.getByRole('button', { name: 'Пересчитать балл' }).click();
    await expect(dialog).toContainText('50% → 50%');
    expect(calls[2]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey);
    expect(revisions).toHaveLength(2);
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(page.getByText('95% → 50%', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'История изменений результата' }).locator('..')).toContainText('По критериям (отмечено / всего)');
    await page.getByRole('button', { name: 'Пересчитать', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Формула', exact: true })).toHaveValue('snapshot');
    await dialog.getByLabel('Причина пересчёта').fill('Restore snapshot formula');
    await dialog.getByRole('button', { name: 'Пересчитать балл' }).click();
    await expect(dialog).toContainText('50% → 95%');
    expect(calls[3]!.idempotencyKey).not.toBe(calls[2]!.idempotencyKey);
    expect(revisions).toHaveLength(3);
    expect(revisions[0]).toMatchObject({ formula: 'criteria', previousPercentage: 95, newPercentage: 50 });
  });
}

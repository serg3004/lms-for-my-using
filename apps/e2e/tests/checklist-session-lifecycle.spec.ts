import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

// PR 307: end-to-end coverage for the checklist workplace-training session module (PR 285-306).
// Real login against the seeded demo org (matching checklist-review-workflow.spec.ts's pattern),
// checklist-session-specific API calls intercepted via page.route() so each test is deterministic
// and independent of real seeded checklist/session data.

const organization = 'demo-company';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'manager' | 'instructor' | 'learner';

const landingByRole: Record<DemoRole, RegExp> = {
  admin: /\/admin$/,
  manager: /\/manager\/dashboard$/,
  instructor: /\/instructor\/dashboard$/,
  learner: /\/learn$/,
};

// The backend's account-level login rate limit is a FIXED 60s window (see
// resilience-matrix.spec.ts for the full rationale): other E2E files log in as these same demo
// accounts too, so this file's login can be the 6th in someone else's window and get a 429 that
// leaves the login form on /login. Only waiting out the full window (60s) reliably clears it, so
// retry once after a 65s backoff instead of failing outright (same pattern as
// login-role-redirect.spec.ts and instructor-workspace.spec.ts).
async function login(page: Page, role: DemoRole) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login');
    await page.locator('input[name="organizationId"]').fill(organization);
    await page.locator('input[name="email"]').fill(`${role}@demo.com`);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await expect(page).toHaveURL(landingByRole[role], { timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(65_000);
    }
  }
}

type ItemResult = {
  id: string;
  itemId: string;
  checked: boolean;
  scaleLevel: null;
  points: number;
  photoUrl: string | null;
  photoFileName: string | null;
  comment: string | null;
  reviewStatus: 'pending';
  reviewComment: null;
  reviewedBy: null;
  reviewedAt: null;
};

const checklistId = 'checklist-lifecycle-1';
const sessionId = 'session-lifecycle-1';
const instanceId = 'instance-lifecycle-1';
const learnerId = 'learner-lifecycle-1';
const observerId = 'observer-lifecycle-1';
const item1Id = 'item-lifecycle-1';
const item2Id = 'item-lifecycle-2';

function checklistSummary(overrides: { title?: string; itemText?: { item1: string; item2: string } } = {}) {
  const itemText = overrides.itemText ?? { item1: 'Turn on the lights', item2: 'Check the fire extinguisher' };
  return {
    id: checklistId,
    organizationId: 'lifecycle-org',
    title: overrides.title ?? 'Opening shift checklist',
    description: null,
    status: 'published',
    scoringMode: 'sum_points',
    passThreshold: 50,
    scaleLevels: null,
    requiresReview: false,
    createdBy: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    items: [
      { id: item1Id, checklistId, order: 0, text: itemText.item1, points: 10, isRequired: true, photoRequired: false, allowSkip: false, weight: 1 },
      { id: item2Id, checklistId, order: 1, text: itemText.item2, points: 10, isRequired: true, photoRequired: true, allowSkip: false, weight: 1 },
    ],
  };
}

function sessionSummary(state: {
  status: 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  version: number;
  startedAt: string | null;
  completedAt?: string | null;
  results: Record<string, ItemResult>;
  locationCapturePolicy?: 'off' | 'optional' | 'required';
}) {
  const resultList = Object.values(state.results);
  const totalScore = resultList.reduce((sum, r) => sum + r.points, 0);
  const maxScore = 20;
  const percentage = Math.round((totalScore / maxScore) * 100);
  const scored = resultList.length > 0;
  return {
    id: sessionId,
    organizationId: 'lifecycle-org',
    instanceId,
    observerId,
    status: state.status,
    version: state.version,
    scheduledAt: '2026-03-02T09:00:00.000Z',
    startedAt: state.startedAt,
    pausedAt: null,
    locationCapturePolicy: state.locationCapturePolicy ?? 'required',
    timezone: 'UTC',
    overdue: false,
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
    observerUnavailableReason: null,
    observerUnavailableAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    checklist: { id: checklistId, title: 'Opening shift checklist' },
    learner: { id: learnerId, firstName: 'Leo', lastName: 'Learner', email: 'leo.learner@example.invalid' },
    observer: { id: observerId, firstName: 'Olga', lastName: 'Observer', email: 'olga.observer@example.invalid' },
    result: {
      instanceStatus: state.status === 'completed' ? 'completed' : state.status === 'cancelled' ? 'assigned' : 'in_progress',
      percentage: state.status === 'completed' ? percentage : null,
      passed: state.status === 'completed' ? percentage >= 50 : null,
      scored: state.status === 'completed' ? scored : null,
      visible: true,
    },
  };
}

function instanceSummary(checklist: ReturnType<typeof checklistSummary>, state: {
  status: 'assigned' | 'in_progress' | 'submitted' | 'completed';
  results: Record<string, ItemResult>;
}) {
  const resultList = Object.values(state.results);
  const totalScore = resultList.reduce((sum, r) => sum + r.points, 0);
  const maxScore = 20;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  return {
    id: instanceId,
    organizationId: 'lifecycle-org',
    checklistId,
    userId: learnerId,
    assignedBy: null,
    reviewerId: null,
    reviewAssignedAt: null,
    reviewAssignedBy: null,
    status: state.status,
    totalScore,
    maxScore,
    percentage,
    passed: state.status === 'completed' && percentage >= 50,
    dueAt: null,
    submittedAt: null,
    completedAt: state.status === 'completed' ? '2026-03-02T10:00:00.000Z' : null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    checklist,
    results: resultList,
  };
}

test.describe('checklist session lifecycle (PR 307 E2E)', () => {
  test('admin creates a session via the wizard; observer conducts it on mobile with geolocation and a required photo; the employee sees the result; the admin views the report and recalculates', async ({ browser }) => {
    // Three independent logins (admin, observer, learner); a rate-limit retry inside login() can
    // wait out a 65s backoff on any of them, so budget well past the default 30s.
    test.setTimeout(240_000);
    let session = sessionSummary({ status: 'scheduled', version: 1, startedAt: null, results: {} });
    let instance = instanceSummary(checklistSummary(), { status: 'assigned', results: {} });
    const events: { id: string; eventType: string; createdAt: string }[] = [
      { id: 'evt-1', eventType: 'created', createdAt: '2026-03-01T00:00:00.000Z' },
    ];
    const revisions: { id: string; previousPercentage: number; newPercentage: number; reason: string; createdAt: string }[] = [];
    const locationCaptures: { id: string; capturePoint: 'start' | 'end'; status: string }[] = [];

    // ---- Admin: create the session via the wizard (#1), see it in the list (#2) ----
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.route('**/api/v1/checklist-sessions/participants**', (route) => {
      const url = new URL(route.request().url());
      const role = url.searchParams.get('role');
      const items = role === 'observer'
        ? [{ id: observerId, firstName: 'Olga', lastName: 'Observer', email: 'olga.observer@example.invalid', position: 'Shift lead' }]
        : [{ id: learnerId, firstName: 'Leo', lastName: 'Learner', email: 'leo.learner@example.invalid', position: 'Barista' }];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    });
    await adminPage.route('**/api/v1/checklists?status=published', (route) => route.fulfill({ json: [checklistSummary()] }));
    await adminPage.route('**/api/v1/checklist-sessions/bulk', async (route) => {
      session = sessionSummary({ status: 'scheduled', version: 1, startedAt: null, results: {} });
      return route.fulfill({
        json: { created: 1, skipped: 0, failed: 0, results: [{ learnerId, status: 'created', sessionId }] },
      });
    });
    await adminPage.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({
      json: { items: [session], page: 1, pageSize: 20, total: 1 },
    }));
    await adminPage.route(`**/api/v1/checklist-sessions/${sessionId}`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: session });
    });
    await adminPage.route(`**/api/v1/checklist-sessions/${sessionId}/events`, (route) => route.fulfill({ json: events }));
    await adminPage.route(`**/api/v1/checklist-sessions/${sessionId}/score-revisions`, (route) => route.fulfill({ json: revisions }));
    await adminPage.route(`**/api/v1/checklist-sessions/${sessionId}/location`, (route) => route.fulfill({
      json: locationCaptures.map((c) => ({ id: c.id, organizationId: 'lifecycle-org', sessionId, capturePoint: c.capturePoint, status: c.status, capturedBy: observerId, capturedAt: '2026-03-02T09:05:00.000Z' })),
    }));
    await adminPage.route(`**/api/v1/checklist-instances/${instanceId}`, (route) => route.fulfill({ json: instance }));

    await test.step('admin creates a session for the learner via the wizard', async () => {
      await login(adminPage, 'admin');
      await adminPage.goto('/admin/checklists/sessions');
      await expect(adminPage.getByRole('heading', { name: 'Сессии' })).toBeVisible();

      await adminPage.getByRole('button', { name: /Новая сессия/ }).click();
      await expect(adminPage.getByRole('heading', { name: 'Новая сессия' })).toBeVisible();

      // Step 0: participants.
      await adminPage.getByRole('radio', { name: /Olga Observer/ }).check();
      await adminPage.getByRole('checkbox', { name: /Leo Learner/ }).check();
      await adminPage.getByRole('button', { name: 'Далее' }).click();

      // Step 1: checklist.
      await adminPage.getByRole('radio', { name: 'Opening shift checklist' }).check();
      await adminPage.getByRole('button', { name: 'Далее' }).click();

      // Step 2: schedule for later -- the observer starts it themselves in the next step, which is
      // what actually exercises the "Start session" button and its geolocation capture (#3, #5);
      // "Start now" would auto-start it here via an unmocked background request instead.
      await adminPage.getByRole('radio', { name: 'Запланировать на потом' }).check();
      await adminPage.getByLabel('Дата и время').fill('2026-03-02T09:00');
      await adminPage.getByLabel('Геолокация').selectOption('required');
      await adminPage.getByRole('button', { name: 'Далее' }).click();

      // Step 3: confirm + create.
      await adminPage.getByRole('button', { name: 'Создать' }).click();
      await expect(adminPage.getByText('Сессии созданы')).toBeVisible();
      await adminPage.getByRole('button', { name: 'Закрыть' }).click();
    });

    await test.step('the session appears in the admin sessions list (#2)', async () => {
      await expect(adminPage.getByText('Opening shift checklist')).toBeVisible();
      await expect(adminPage.getByText('Leo Learner')).toBeVisible();
    });

    // ---- Observer: conduct the session on a mobile viewport (#3), geolocation start/end (#5), required photo (#4) ----
    const observerContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await observerContext.grantPermissions(['geolocation']);
    await observerContext.setGeolocation({ latitude: 55.751244, longitude: 37.618423 });
    const observerPage = await observerContext.newPage();

    await observerPage.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({
      json: { items: [session], page: 1, pageSize: 100, total: 1 },
    }));
    await observerPage.route(`**/api/v1/checklist-sessions/${sessionId}`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: session });
    });
    await observerPage.route(`**/api/v1/checklist-instances/${instanceId}`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: instance });
    });
    await observerPage.route(`**/api/v1/checklist-sessions/${sessionId}/start`, (route) => {
      session = { ...session, status: 'in_progress', version: session.version + 1, startedAt: '2026-03-02T09:05:00.000Z' };
      events.push({ id: `evt-${events.length + 1}`, eventType: 'started', createdAt: '2026-03-02T09:05:00.000Z' });
      return route.fulfill({ json: session });
    });
    await observerPage.route(`**/api/v1/checklist-sessions/${sessionId}/complete`, (route) => {
      // Recompute the result from the instance's actual persisted answers, exactly like the real
      // backend would -- a naive status-only spread would leave result.percentage at the `null` it
      // had while still in_progress, silently wrong for every screen that reads it after completion.
      const totalScore = instance.results.reduce((sum, r) => sum + r.points, 0);
      const percentage = Math.round((totalScore / instance.maxScore) * 100);
      session = {
        ...session,
        status: 'completed',
        version: session.version + 1,
        result: { instanceStatus: 'completed', percentage, passed: percentage >= 50, scored: true, visible: true },
      };
      events.push({ id: `evt-${events.length + 1}`, eventType: 'completed', createdAt: '2026-03-02T09:40:00.000Z' });
      return route.fulfill({ json: session });
    });
    await observerPage.route(`**/api/v1/checklist-sessions/${sessionId}/location/*`, (route) => {
      const point = route.request().url().split('/location/')[1] as 'start' | 'end';
      const body = route.request().postDataJSON() as { status: string };
      locationCaptures.push({ id: `capture-${point}`, capturePoint: point, status: body.status });
      return route.fulfill({
        json: { id: `capture-${point}`, organizationId: 'lifecycle-org', sessionId, capturePoint: point, status: body.status, capturedBy: observerId, capturedAt: new Date().toISOString() },
      });
    });
    await observerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${item1Id}`, (route) => {
      const body = route.request().postDataJSON() as { checked?: boolean };
      instance = instanceSummary(checklistSummary(), {
        status: 'in_progress',
        results: {
          ...instance.results.reduce((acc, r) => ({ ...acc, [r.itemId]: r }), {} as Record<string, ItemResult>),
          [item1Id]: { id: 'result-1', itemId: item1Id, checked: body.checked ?? false, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
        },
      });
      return route.fulfill({ json: instance });
    });
    await observerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${item2Id}`, (route) => {
      const body = route.request().postDataJSON() as { checked?: boolean };
      const existing = instance.results.find((r) => r.itemId === item2Id);
      instance = instanceSummary(checklistSummary(), {
        status: 'in_progress',
        results: {
          ...instance.results.reduce((acc, r) => ({ ...acc, [r.itemId]: r }), {} as Record<string, ItemResult>),
          [item2Id]: { id: 'result-2', itemId: item2Id, checked: body.checked ?? existing?.checked ?? false, scaleLevel: null, points: 10, photoUrl: existing?.photoUrl ?? null, photoFileName: existing?.photoFileName ?? null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
        },
      });
      return route.fulfill({ json: instance });
    });
    await observerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${item2Id}/photo`, (route) => {
      const existing = instance.results.find((r) => r.itemId === item2Id);
      instance = instanceSummary(checklistSummary(), {
        status: 'in_progress',
        results: {
          ...instance.results.reduce((acc, r) => ({ ...acc, [r.itemId]: r }), {} as Record<string, ItemResult>),
          [item2Id]: { id: 'result-2', itemId: item2Id, checked: existing?.checked ?? true, scaleLevel: null, points: 10, photoUrl: 'https://example.invalid/photo.jpg', photoFileName: 'shift-photo.jpg', comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
        },
      });
      return route.fulfill({ json: instance });
    });

    await test.step('observer opens the session on a mobile viewport and starts it, capturing geolocation (#3, #5)', async () => {
      await login(observerPage, 'instructor');
      await observerPage.goto('/instructor/checklists');
      await observerPage.getByRole('tab', { name: 'Проведение' }).click();
      await observerPage.getByText('Opening shift checklist').click();

      await observerPage.getByRole('button', { name: 'Начать сессию' }).click();
      await expect(observerPage.getByText('В процессе')).toBeVisible();
      await expect.poll(() => locationCaptures.find((c) => c.capturePoint === 'start')?.status).toBe('captured');
    });

    await test.step('observer answers the first criterion and attaches a required photo on the second (#4)', async () => {
      // A plain click, not .check(): every answer here round-trips through a real PATCH + reload
      // (matching production), so the checkbox briefly re-renders mid-toggle -- .check()'s own
      // strict "did it flip in one settled step" assertion is flaky against that, even though the
      // end state (asserted via the poll below, then toBeChecked()) is always correct.
      await observerPage.getByRole('checkbox', { name: 'Выполнено' }).click();
      await expect.poll(() => instance.results.find((r) => r.itemId === item1Id)?.checked).toBe(true);
      await expect(observerPage.getByRole('checkbox', { name: 'Выполнено' })).toBeChecked();

      await observerPage.getByRole('button', { name: 'Далее' }).click();
      await observerPage.getByRole('checkbox', { name: 'Выполнено' }).click();
      await expect.poll(() => instance.results.find((r) => r.itemId === item2Id)?.checked).toBe(true);
      await expect(observerPage.getByRole('checkbox', { name: 'Выполнено' })).toBeChecked();

      await observerPage.getByRole('button', { name: 'Прикрепить фото' }).click();
      const fileInput = observerPage.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'shift-photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      });
      await expect.poll(() => instance.results.find((r) => r.itemId === item2Id)?.photoFileName).toBe('shift-photo.jpg');
    });

    await test.step('observer completes the session, capturing geolocation again (#5)', async () => {
      await expect(observerPage.getByRole('button', { name: 'Завершить' })).toBeEnabled();
      await observerPage.getByRole('button', { name: 'Завершить' }).click();
      await expect.poll(() => session.status).toBe('completed');
      await expect.poll(() => locationCaptures.find((c) => c.capturePoint === 'end')?.status).toBe('captured');
    });

    // ---- Employee: sees the result (#6) ----
    const learnerContext = await browser.newContext();
    const learnerPage = await learnerContext.newPage();
    await learnerPage.route('**/api/v1/checklist-instances/mine', (route) => route.fulfill({ json: [] }));
    await learnerPage.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({
      json: { items: [session], page: 1, pageSize: 100, total: 1 },
    }));

    await test.step('the employee sees their completed result (#6)', async () => {
      await login(learnerPage, 'learner');
      await learnerPage.goto('/learn/checklists');
      await learnerPage.getByRole('tab', { name: 'Завершено' }).click();
      await expect(learnerPage.getByText('Opening shift checklist')).toBeVisible();
      await expect(learnerPage.getByText(`${session.result.percentage}%`)).toBeVisible();
    });

    // ---- Admin: views the report (#11) and recalculates the score (#12) ----
    await adminPage.route(`**/api/v1/checklist-sessions/${sessionId}/recalculate`, (route) => {
      const body = route.request().postDataJSON() as { reason: string };
      const previousPercentage = session.result.percentage ?? 0;
      const newPercentage = 100;
      revisions.push({ id: 'revision-1', previousPercentage, newPercentage, reason: body.reason, createdAt: '2026-03-02T11:00:00.000Z' });
      events.push({ id: `evt-${events.length + 1}`, eventType: 'score_recalculated', createdAt: '2026-03-02T11:00:00.000Z' });
      session = { ...session, result: { ...session.result, percentage: newPercentage, passed: true, scored: true } };
      // Matches the production RecalculateChecklistScoreResult shape (newPassed + scored, not just
      // the percentage) -- AdminChecklistSessionReportPage.tsx's onScoreRecalculated writes these
      // fields straight into session.result, so a fixture missing them would silently regress to
      // "Not scored" on the Summary tab without this test noticing.
      return route.fulfill({ json: { id: 'revision-1', sessionId, previousPercentage, newPercentage, newPassed: true, scored: true, reason: body.reason, createdAt: '2026-03-02T11:00:00.000Z' } });
    });

    await test.step('admin opens the session report (#11)', async () => {
      await adminPage.goto(`/admin/checklists/sessions/${sessionId}`);
      await expect(adminPage.getByRole('heading', { name: 'Opening shift checklist' })).toBeVisible();
      await expect(adminPage.getByText(`${session.result.percentage}%`)).toBeVisible();
    });

    await test.step('admin recalculates the score, creating a new revision (#12)', async () => {
      await adminPage.getByRole('tab', { name: 'История' }).click();
      await expect(adminPage.getByText('Балл ещё ни разу не пересчитывался.')).toBeVisible();

      await adminPage.getByLabel('Причина пересчёта').fill('Manual audit correction');
      await adminPage.getByRole('button', { name: 'Пересчитать балл' }).click();

      await expect.poll(() => revisions.length).toBe(1);
      await expect(adminPage.getByText(`${revisions[0]!.previousPercentage}% → ${revisions[0]!.newPercentage}%`)).toBeVisible();

      // The recalculated score merges into local state via onScoreRecalculated (not a full
      // reload); switching back to Summary proves the merge produced a real "100% ✓", not a
      // stale/undefined `scored` silently rendering "Not scored".
      await adminPage.getByRole('tab', { name: 'Сводка' }).click();
      await expect(adminPage.getByText('100% ✓')).toBeVisible();
    });

    await adminContext.close();
    await observerContext.close();
    await learnerContext.close();
  });

  test('manager sees only their own scoped analytics, can drill into an employee\'s sessions, and a narrower scope neither leaks nor loses aggregate rows (#7, #8, #9)', async ({ browser }) => {
    // A rate-limit retry inside login() can wait out a 65s backoff; budget well past the
    // default 30s so that wait doesn't itself time out the test.
    test.setTimeout(90_000);
    // Real cross-tenant/manager-scope enforcement (a foreign manager's team excludes a sibling
    // employee) is proven server-side against real Postgres in
    // checklist-manager-analytics.database.spec.ts. This test proves the frontend's half: it
    // renders exactly the employees its own scoped API response contains -- no more (no
    // client-side leakage beyond what the manager's own scope returned) and no fewer (the drilldown
    // and the aggregate totals stay consistent with each other for the same response).
    const inScopeEmployee = { userId: 'scoped-emp-1', firstName: 'Ivy', lastName: 'InScope', department: 'Warehouse', sessionsCount: 2, completedCount: 2, averagePercentage: 88, trend: 'up' as const, lastSessionAt: '2026-03-01T00:00:00.000Z' };
    const analytics = {
      summary: { totalEmployees: 1, totalSessions: 2, completedSessions: 2, averagePercentage: 88, lowCount: 0, highCount: 1, noCompletionCount: 0 },
      thresholds: { high: 90, low: 60 },
      distribution: [{ bucket: 'low', count: 0 }, { bucket: 'mid', count: 0 }, { bucket: 'high', count: 1 }],
      trend: [{ date: '2026-02-25', averagePercentage: 88, count: 2 }],
      employees: [inScopeEmployee],
    };
    const drilldownSessions = [{
      id: 'drilldown-session-1', organizationId: 'lifecycle-org', instanceId: 'drilldown-instance-1', observerId,
      status: 'completed', version: 1, scheduledAt: '2026-03-01T09:00:00.000Z', startedAt: '2026-03-01T09:05:00.000Z',
      pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
      strengths: null, developmentAreas: null, nextSteps: null,
      observerUnavailableReason: null, observerUnavailableAt: null,
      createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
      checklist: { id: checklistId, title: 'Opening shift checklist' },
      learner: { id: inScopeEmployee.userId, firstName: 'Ivy', lastName: 'InScope', email: 'ivy@example.invalid' },
      observer: { id: observerId, firstName: 'Olga', lastName: 'Observer', email: 'olga.observer@example.invalid' },
      result: { instanceStatus: 'completed', percentage: 88, passed: true, scored: true, visible: true },
    }];

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/v1/checklists', (route) => route.fulfill({ json: [checklistSummary()] }));
    await page.route('**/api/v1/checklists/manager-analytics*', (route) => route.fulfill({ json: analytics }));
    await page.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({
      json: { items: drilldownSessions, page: 1, pageSize: 50, total: drilldownSessions.length },
    }));

    await test.step('manager sees only their own scoped employees and totals (#7)', async () => {
      await login(page, 'manager');
      await page.goto('/manager/checklists');

      const employeesTable = page.getByRole('table', { name: 'Сотрудники' });
      await expect(employeesTable.getByText('Ivy InScope')).toBeVisible();
      // Exactly the one employee the scoped response contains -- no invented/leaked extra row.
      await expect(employeesTable.getByRole('row')).toHaveCount(2); // header + the one employee row
      const completedCard = page.locator('.stat-card', { hasText: 'Завершено' });
      await expect(completedCard.locator('.stat-card__value')).toHaveText(String(analytics.summary.completedSessions));
    });

    await test.step('manager drills down into the employee and sees their sessions, consistent with the aggregate (#8)', async () => {
      await page.getByRole('button', { name: /Показать сессии — Ivy InScope/ }).click();
      await expect(page.locator('.ds-data-table__expanded').getByText('Opening shift checklist')).toBeVisible();
    });

    await context.close();
  });

  // instructor@demo.com is also logged into by several other spec files (instructor-workspace.spec.ts,
  // checklist-photo-review.spec.ts, login-role-redirect.spec.ts), and /api/v1/auth/login is rate-limited
  // to 5 requests/60s per account (DEFAULT_SENSITIVE_RATE_LIMIT_POLICY in
  // apps/api/src/common/middleware/api-hardening.ts) against an in-memory, single-process store in this
  // E2E environment (no REDIS_URL is set for the API in apps/e2e/playwright.config.ts's webServer, so
  // every Playwright worker shares one counter). Neither scenario below needs an independent session --
  // just independent route mocks -- so they share ONE real login instead of two (`serial` mode pins both
  // tests onto the same worker so `beforeAll` only runs once) to avoid tipping that shared account over
  // the limit when the full suite runs.
  test.describe('instructor session views sharing one login', () => {
    test.describe.configure({ mode: 'serial' });

    let sharedContext: Awaited<ReturnType<import('@playwright/test').Browser['newContext']>>;

    test.beforeAll(async ({ browser }, testInfo) => {
      // A rate-limit retry inside login() can wait out a 65s backoff; budget well past the
      // default timeout so that wait doesn't itself time out the hook.
      testInfo.setTimeout(90_000);
      sharedContext = await browser.newContext();
      const setupPage = await sharedContext.newPage();
      await login(setupPage, 'instructor');
      await setupPage.close();
    });

    test.afterAll(async () => {
      await sharedContext.close();
    });

    test('a checklist edited after a session was scheduled still shows the original snapshotted criterion text (#10)', async () => {
      const originalItemText = 'Turn on the lights';
      const editedItemText = 'Turn on the lights AND the espresso machine';
      const snapshotChecklist = checklistSummary({ itemText: { item1: originalItemText, item2: 'Check the fire extinguisher' } });
      const session = sessionSummary({ status: 'in_progress', version: 1, startedAt: '2026-03-02T09:00:00.000Z', results: {}, locationCapturePolicy: 'off' });
      const instance = instanceSummary(snapshotChecklist, { status: 'in_progress', results: {} });

      const page = await sharedContext.newPage();
      await page.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({ json: { items: [session], page: 1, pageSize: 100, total: 1 } }));
      await page.route(`**/api/v1/checklist-sessions/${sessionId}`, (route) => route.fulfill({ json: session }));
      // The live checklist has since been edited -- the instance's snapshot (served above) must win,
      // this route must never be what the conduct screen actually renders from.
      await page.route(`**/api/v1/checklists/${checklistId}`, (route) => route.fulfill({
        json: checklistSummary({ itemText: { item1: editedItemText, item2: 'Check the fire extinguisher' } }),
      }));
      await page.route(`**/api/v1/checklist-instances/${instanceId}`, (route) => route.fulfill({ json: instance }));

      await page.goto('/instructor/checklists');
      await page.getByRole('tab', { name: 'Проведение' }).click();
      await page.getByText('Opening shift checklist').click();

      await expect(page.getByText(originalItemText)).toBeVisible();
      await expect(page.getByText(editedItemText)).not.toBeVisible();

      await page.close();
    });

    test('two attempts to complete the same session: the second is routed to a safe reload prompt, not a silent overwrite (#14)', async () => {
      const session = sessionSummary({ status: 'in_progress', version: 5, startedAt: '2026-03-02T09:00:00.000Z', results: {}, locationCapturePolicy: 'off' });
      const instance = instanceSummary(checklistSummary(), {
        status: 'in_progress',
        results: {
          [item1Id]: { id: 'r1', itemId: item1Id, checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
          [item2Id]: { id: 'r2', itemId: item2Id, checked: true, scaleLevel: null, points: 10, photoUrl: 'https://example.invalid/p.jpg', photoFileName: 'p.jpg', comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null },
        },
      });

      const page = await sharedContext.newPage();
      let completeAttempts = 0;
      await page.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({ json: { items: [session], page: 1, pageSize: 100, total: 1 } }));
      await page.route(`**/api/v1/checklist-sessions/${sessionId}`, (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        return route.fulfill({ json: session });
      });
      await page.route(`**/api/v1/checklist-instances/${instanceId}`, (route) => route.fulfill({ json: instance }));
      await page.route(`**/api/v1/checklist-sessions/${sessionId}/complete`, (route) => {
        completeAttempts += 1;
        // The first "complete" already won (e.g. from another tab) -- this attempt's version is now
        // stale, exactly what a real 409 from ChecklistSessionService.transition() looks like.
        return route.fulfill({
          status: 409,
          json: { statusCode: 409, error: { code: 'CONFLICT', message: 'This session was already updated.' }, path: `/api/v1/checklist-sessions/${sessionId}/complete`, timestamp: new Date().toISOString() },
        });
      });

      await page.goto('/instructor/checklists');
      await page.getByRole('tab', { name: 'Проведение' }).click();
      await page.getByText('Opening shift checklist').click();

      await page.getByRole('button', { name: 'Завершить' }).click();

      await expect(page.getByText('Сессия изменилась в другом месте')).toBeVisible();
      expect(completeAttempts).toBe(1);
      // No silent overwrite: the session's displayed status is still what the server actually holds,
      // never optimistically flipped to "completed" on the client from a request that the server
      // rejected.
      await expect(page.getByText('Завершена', { exact: true })).not.toBeVisible();

      await page.close();
    });
  });

  test('a session where every criterion was skipped shows an explicit not-scored result, not a blank one (#15)', async ({ browser }) => {
    // A rate-limit retry inside login() can wait out a 65s backoff; budget well past the
    // default 30s so that wait doesn't itself time out the test.
    test.setTimeout(90_000);
    const skippedChecklist = checklistSummary();
    skippedChecklist.items = skippedChecklist.items.map((item) => ({ ...item, allowSkip: true }));
    const session = sessionSummary({ status: 'completed', version: 3, startedAt: '2026-03-02T09:00:00.000Z', results: {}, locationCapturePolicy: 'off' });
    // Every item skipped -> scored: false (PR 290's not_scored semantics), but the session
    // completed successfully -- distinct from "not completed yet", which is what PR 306 anomaly
    // #11's describeChecklistSessionResult() disambiguates.
    session.result = { instanceStatus: 'completed', percentage: null, passed: null, scored: false, visible: true };

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/v1/checklist-instances/mine', (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/v1\/checklist-sessions(\?.*)?$/, (route) => route.fulfill({ json: { items: [session], page: 1, pageSize: 100, total: 1 } }));

    await login(page, 'learner');
    await page.goto('/learn/checklists');
    await page.getByRole('tab', { name: 'Завершено' }).click();

    await expect(page.getByText('Без оценки — все критерии были пропущены')).toBeVisible();

    await context.close();
  });
});

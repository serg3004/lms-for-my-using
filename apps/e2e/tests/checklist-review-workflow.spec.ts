import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';
const instanceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const checklistId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const learnerId = '11111111-1111-4111-8111-111111111111';
const item1Id = '22222222-2222-4222-8222-222222222222';
const item2Id = '33333333-3333-4333-8333-333333333333';

type ItemResult = {
  id: string;
  itemId: string;
  checked: boolean;
  scaleLevel: null;
  points: number;
  photoUrl: null;
  photoFileName: null;
  comment: null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

type InstanceStatus = 'assigned' | 'in_progress' | 'submitted' | 'completed';

function buildInstance(
  results: Record<string, ItemResult>,
  status: InstanceStatus,
  reviewerId: string | null,
  reviewAssignedAt: string | null,
) {
  const resultList = Object.values(results);
  const totalScore = resultList.reduce((sum, r) => sum + (r.reviewStatus === 'rejected' ? 0 : r.points), 0);
  const maxScore = 20;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  return {
    id: instanceId,
    organizationId: '10000000-0000-4000-8000-000000000001',
    checklistId,
    userId: learnerId,
    assignedBy: null,
    reviewerId,
    reviewAssignedAt,
    reviewAssignedBy: reviewerId ? 'someone' : null,
    status,
    totalScore,
    maxScore,
    percentage,
    passed: status === 'completed' && percentage >= 50,
    dueAt: null,
    submittedAt: status === 'submitted' || status === 'completed' ? '2026-08-26T00:00:00.000Z' : null,
    completedAt: status === 'completed' ? '2026-08-26T01:00:00.000Z' : null,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    checklist: {
      id: checklistId,
      organizationId: '10000000-0000-4000-8000-000000000001',
      title: 'Review workflow E2E',
      description: null,
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 50,
      scaleLevels: null,
      requiresReview: true,
      createdBy: null,
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
      items: [
        { id: item1Id, checklistId, order: 0, text: 'Check helmet', points: 10, isRequired: true, photoRequired: false },
        { id: item2Id, checklistId, order: 1, text: 'Check fire extinguisher', points: 10, isRequired: true, photoRequired: false },
      ],
    },
    results: resultList,
  };
}

function analyticsFor(status: InstanceStatus, passed: boolean) {
  return {
    assignmentsTotal: 1,
    counts: {
      assigned: status === 'assigned' ? 1 : 0,
      in_progress: status === 'in_progress' ? 1 : 0,
      submitted: status === 'submitted' ? 1 : 0,
      completed: status === 'completed' ? 1 : 0,
      expired: 0,
    },
    completionRate: status === 'completed' ? 1 : 0,
    passRate: status === 'completed' ? (passed ? 1 : 0) : 0,
    averagePercentage: status === 'completed' ? 50 : 0,
    expiredRate: 0,
    pendingReview: status === 'submitted' ? 1 : 0,
    averageCompletionTimeMs: 0,
    averageReviewTimeMs: 0,
  };
}

async function login(page: Page, role: 'learner' | 'mentor') {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(role === 'learner' ? /\/learn$/ : /\/mentor$/);
}

test('full checklist review lifecycle: assignment, learner completion, reviewer routing, decisions, analytics and event history', async ({ browser }) => {
  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();
  const results: Record<string, ItemResult> = {};
  let learnerStatus: InstanceStatus = 'assigned';

  await learnerPage.route('**/api/v1/checklist-instances/mine', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([buildInstance(results, learnerStatus, null, null)]) }));
  await learnerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/*`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const url = route.request().url();
    const itemId = url.includes(item1Id) ? item1Id : item2Id;
    const wasComplete = Boolean(results[item1Id]) && Boolean(results[item2Id]);
    results[itemId] = {
      id: `result-${itemId}`, itemId, checked: true, scaleLevel: null, points: 10,
      photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null,
      reviewedBy: null, reviewedAt: null,
    };
    learnerStatus = wasComplete ? learnerStatus : (results[item1Id] && results[item2Id] ? 'submitted' : 'in_progress');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildInstance(results, learnerStatus, null, null)) });
  });

  await test.step('learner completes both checklist items', async () => {
    await login(learnerPage, 'learner');
    await learnerPage.goto('/learn/checklists');
    await learnerPage.getByText('Review workflow E2E').click();

    const checkboxes = learnerPage.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(0).click();
    await expect.poll(() => results[item1Id]?.checked).toBe(true);
    await checkboxes.nth(1).click();
    await expect.poll(() => results[item2Id]?.checked).toBe(true);
    await expect.poll(() => learnerStatus).toBe('submitted');
  });

  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  let reviewerId: string | null = null;
  let reviewAssignedAt: string | null = null;
  const events: { id: string; eventType: string; createdAt: string }[] = [
    { id: 'evt-assigned', eventType: 'assigned', createdAt: '2026-08-26T00:00:00.000Z' },
    { id: 'evt-submitted', eventType: 'submitted', createdAt: '2026-08-26T00:05:00.000Z' },
  ];
  let eventSeq = events.length;

  function currentInstance(status: InstanceStatus = 'submitted') {
    return buildInstance(results, status, reviewerId, reviewAssignedAt);
  }

  await reviewerPage.route('**/api/v1/checklist-instances/review-queue*', (route) => {
    const url = new URL(route.request().url());
    const assignment = url.searchParams.get('assignment') ?? 'mine';
    const inst = currentInstance(results[item1Id]?.reviewStatus !== 'pending' && results[item2Id]?.reviewStatus !== 'pending' ? 'completed' : 'submitted');
    const matches =
      assignment === 'all' ? true :
      assignment === 'unassigned' ? reviewerId === null :
      /* mine */ reviewerId !== null;
    const items = matches && inst.status === 'submitted' ? [inst] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, page: 1, pageSize: 20, total: items.length }) });
  });
  await reviewerPage.route('**/api/v1/checklists/analytics*', (route) => {
    const done = results[item1Id]?.reviewStatus !== 'pending' && results[item2Id]?.reviewStatus !== 'pending';
    const status: InstanceStatus = done ? 'completed' : 'submitted';
    const passed = done && (results[item1Id]?.reviewStatus === 'approved' ? 10 : 0) + (results[item2Id]?.reviewStatus === 'approved' ? 10 : 0) >= 10;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyticsFor(status, passed)) });
  });
  await reviewerPage.route(`**/api/v1/checklist-instances/${instanceId}/reviewer`, async (route) => {
    const body = route.request().postDataJSON() as { reviewerId: string | null };
    reviewerId = body.reviewerId;
    reviewAssignedAt = reviewerId ? new Date().toISOString() : null;
    eventSeq += 1;
    events.push({ id: `evt-${eventSeq}`, eventType: 'reviewer_assigned', createdAt: new Date().toISOString() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: instanceId, organizationId: '10000000-0000-4000-8000-000000000001', checklistId, userId: learnerId,
        assignedBy: null, reviewerId, reviewAssignedAt, reviewAssignedBy: reviewerId ? 'someone' : null,
        status: 'submitted', totalScore: 0, maxScore: 20, percentage: 0, passed: false,
        dueAt: null, submittedAt: '2026-08-26T00:00:00.000Z', completedAt: null,
        createdAt: '2026-08-26T00:00:00.000Z', updatedAt: new Date().toISOString(),
      }),
    });
  });
  await reviewerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/*/review`, async (route) => {
    const url = route.request().url();
    const itemId = url.includes(item1Id) ? item1Id : item2Id;
    const body = route.request().postDataJSON() as { status: 'approved' | 'rejected'; comment?: string };
    results[itemId] = { ...results[itemId], reviewStatus: body.status, reviewComment: body.comment ?? null, reviewedBy: 'reviewer', reviewedAt: new Date().toISOString() };
    eventSeq += 1;
    events.push({ id: `evt-${eventSeq}`, eventType: body.status === 'approved' ? 'item_approved' : 'item_rejected', createdAt: new Date().toISOString() });
    const done = results[item1Id]?.reviewStatus !== 'pending' && results[item2Id]?.reviewStatus !== 'pending';
    if (done) {
      eventSeq += 1;
      events.push({ id: `evt-${eventSeq}`, eventType: 'completed', createdAt: new Date().toISOString() });
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(currentInstance(done ? 'completed' : 'submitted')) });
  });
  await reviewerPage.route(`**/api/v1/checklist-instances/${instanceId}/events`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) }));

  await test.step('reviewer finds the unassigned instance and assigns it to themself', async () => {
    await login(reviewerPage, 'mentor');

    await expect(reviewerPage.getByText('Сейчас нечего проверять')).toBeVisible();

    await reviewerPage.getByRole('tab', { name: 'Без назначения' }).click();
    await reviewerPage.getByText('Review workflow E2E').click();
    await reviewerPage.getByRole('button', { name: 'Назначить себе' }).click();

    await expect.poll(() => reviewerId).not.toBeNull();
    await expect(reviewerPage.getByText('Назначено мне')).toBeVisible();
  });

  await test.step('event history reflects submission and reviewer assignment', async () => {
    await expect(reviewerPage.getByText('Отправлено на проверку')).toBeVisible();
    await expect(reviewerPage.getByText('Назначен проверяющий')).toBeVisible();
  });

  await test.step('reviewer rejects one item and approves the other, completing the instance', async () => {
    const approveButtons = reviewerPage.locator('button').filter({ hasText: '✓' });
    const rejectButtons = reviewerPage.locator('button').filter({ hasText: '✕' });

    await rejectButtons.nth(0).click();
    await expect.poll(() => results[item1Id]?.reviewStatus).toBe('rejected');

    await approveButtons.nth(1).click();
    await expect.poll(() => results[item2Id]?.reviewStatus).toBe('approved');
    await expect.poll(() => results[item1Id]?.reviewStatus !== 'pending' && results[item2Id]?.reviewStatus !== 'pending').toBe(true);
  });

  await test.step('event history now includes the review decisions and completion', async () => {
    await expect(reviewerPage.getByText('Пункт отклонён')).toBeVisible();
    await expect(reviewerPage.getByText('Пункт подтверждён')).toBeVisible();
    await expect(reviewerPage.getByText('Проверка завершена')).toBeVisible();
  });

  await test.step('analytics reflect the completed, half-scored assignment', async () => {
    await reviewerPage.getByText('Все ожидающие проверки').click();
    const completedCard = reviewerPage.locator('.stat-card', { hasText: 'Завершено' });
    await expect(completedCard.locator('.stat-card__value')).toHaveText('1');
  });
});

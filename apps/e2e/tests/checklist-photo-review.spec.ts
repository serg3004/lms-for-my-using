import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';
const instanceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const checklistId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const learnerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const photoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz9QAAAABJRU5ErkJggg==';

type Result = {
  id: string;
  itemId: string;
  checked: boolean;
  scaleLevel: null;
  points: number;
  photoUrl: null;
  photoFileName: string | null;
  comment: null;
  reviewStatus: 'pending' | 'approved';
  reviewComment: null;
  reviewedBy: null;
  reviewedAt: null;
};

function instance(result: Result | null, status: 'assigned' | 'in_progress' | 'submitted' | 'completed') {
  return {
    id: instanceId,
    organizationId: '10000000-0000-4000-8000-000000000001',
    checklistId,
    userId: learnerId,
    assignedBy: null,
    reviewerId: null,
    reviewAssignedAt: null,
    reviewAssignedBy: null,
    status,
    totalScore: result?.points ?? 0,
    maxScore: 10,
    percentage: result ? 100 : 0,
    passed: status === 'completed',
    dueAt: null,
    submittedAt: status === 'submitted' ? '2026-08-23T00:00:00.000Z' : null,
    completedAt: status === 'completed' ? '2026-08-23T00:00:00.000Z' : null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    checklist: {
      id: checklistId,
      organizationId: '10000000-0000-4000-8000-000000000001',
      title: 'Photo review E2E',
      description: null,
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 80,
      scaleLevels: null,
      requiresReview: true,
      createdBy: null,
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
      items: [{ id: itemId, checklistId, order: 0, text: 'Attach safety evidence', points: 10, isRequired: true, photoRequired: true }],
    },
    results: result ? [result] : [],
  };
}

async function login(page: Page, role: 'learner' | 'instructor') {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(role === 'learner' ? /\/learn$/ : /\/instructor\/dashboard$/);
}

test('learner evidence is detected and opened by instructor before approval', async ({ browser }) => {
  const learnerContext = await browser.newContext();
  const learnerPage = await learnerContext.newPage();
  let learnerResult: Result | null = null;
  let learnerStatus: 'assigned' | 'in_progress' | 'submitted' = 'assigned';

  await learnerPage.route('**/api/v1/checklist-instances/mine', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([instance(learnerResult, learnerStatus)]) }));
  await learnerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${itemId}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    learnerResult = {
      id: 'result-1', itemId, checked: true, scaleLevel: null, points: 10,
      photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null,
      reviewedBy: null, reviewedAt: null,
    };
    learnerStatus = 'in_progress';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(instance(learnerResult, learnerStatus)) });
  });
  await learnerPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${itemId}/photo`, async (route) => {
    if (route.request().method() === 'POST') {
      learnerResult = { ...learnerResult!, photoFileName: 'evidence.png' };
      learnerStatus = 'submitted';
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(instance(learnerResult, learnerStatus)) });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: photoDataUrl, expiresIn: 300 }) });
      return;
    }
    await route.continue();
  });

  await test.step('learner marks the item and attaches object-backed evidence', async () => {
    await login(learnerPage, 'learner');
    await learnerPage.goto('/learn/checklists');
    await learnerPage.getByText('Photo review E2E').click();

    const checkbox = learnerPage.locator('input[type="checkbox"]');
    await expect(checkbox).toHaveCount(1);
    await checkbox.click();
    await expect.poll(() => learnerResult?.checked).toBe(true);

    const fileInput = learnerPage.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);
    await expect(fileInput).toBeEnabled();
    await fileInput.setInputFiles({
      name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('evidence'),
    });
    await expect.poll(() => learnerResult?.photoFileName).toBe('evidence.png');
    await expect(learnerPage.getByText('evidence.png')).toBeVisible();
  });

  const instructorContext = await browser.newContext();
  const instructorPage = await instructorContext.newPage();
  const submitted = instance(learnerResult, 'submitted');
  let reviewed = false;

  await instructorPage.route('**/api/v1/checklist-instances/review-queue*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [submitted], page: 1, pageSize: 20, total: 1 }) }));
  await instructorPage.route('**/api/v1/checklists/analytics*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        assignmentsTotal: 1,
        counts: { assigned: 0, in_progress: 0, submitted: 1, completed: 0, expired: 0 },
        completionRate: 0, passRate: 0, averagePercentage: 0, expiredRate: 0,
        pendingReview: 1, averageCompletionTimeMs: 0, averageReviewTimeMs: 0,
      }),
    }));
  await instructorPage.route(`**/api/v1/checklist-instances/${instanceId}/events`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await instructorPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${itemId}/photo`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: photoDataUrl, expiresIn: 300 }) }));
  await instructorPage.route(`**/api/v1/checklist-instances/${instanceId}/items/${itemId}/review`, async (route) => {
    reviewed = true;
    learnerResult = { ...learnerResult!, reviewStatus: 'approved' };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(instance(learnerResult, 'completed')) });
  });

  await test.step('instructor opens evidence and approves the result', async () => {
    await login(instructorPage, 'instructor');
    await instructorPage.goto('/instructor/checklists');
    await instructorPage.getByText('Photo review E2E').click();
    await expect(instructorPage.getByText('evidence.png')).toBeVisible();
    await expect(instructorPage.getByText('photo missing', { exact: false })).toHaveCount(0);

    const evidenceRow = instructorPage.getByText('evidence.png').locator('..');
    await evidenceRow.getByRole('button').click();
    await expect(instructorPage.getByRole('img', { name: 'evidence.png' })).toBeVisible();

    await instructorPage.locator('button').filter({ hasText: '✓' }).click();
    await expect.poll(() => reviewed).toBe(true);
  });
});

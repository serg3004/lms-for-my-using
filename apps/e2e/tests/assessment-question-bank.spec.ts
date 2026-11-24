import { expect, test } from '@playwright/test';

test('shows the linked question usage before confirming an edit', async ({ page }) => {
  const question = {
    id: 'question', bankEntryId: 'bank', title: 'Shared question', type: 'true_false', text: null,
    imageUrl: null, points: 1, scoringMode: 'all_or_nothing', definition: { type: 'true_false', correctAnswer: true }, options: [],
  };
  const content = { ...question, id: undefined, bankEntryId: undefined };
  let saved = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: 'admin', organizationId: 'org', roles: ['admin'], status: 'active',
      firstName: 'Ada', lastName: 'Admin', locale: 'en', timezone: 'UTC',
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path.endsWith('/editor')) return route.fulfill({ json: {
      assessment: {
        id: 'quiz', title: 'Safety test', slug: 'safety-test', status: 'published', passingScore: 70, maxAttempts: null,
        timeLimitMinutes: null, availableAfterCourseCompletion: false, showCorrectAnswers: true, randomizeOrder: false,
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      questions: [question], placements: [], assignments: [], draft: null,
    } });
    if (path === '/question-bank') return route.fulfill({ json: { entries: [], folders: [] } });
    if (path === '/question-bank/bank/usage') return route.fulfill({ json: {
      assessments: [{ title: 'Safety test' }], courses: [{ title: 'Orientation' }], longreads: [], confirmation: 'confirmation',
    } });
    if (path === '/question-bank/bank') {
      if (route.request().method() === 'PATCH') {
        expect(route.request().postDataJSON()).toMatchObject({ confirmation: 'confirmation' });
        saved++;
      }
      return route.fulfill({ json: { id: question.bankEntryId, title: content.title, content } });
    }
    return route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto('/admin/assessments/quiz/edit');
  await expect(page.getByText('From question bank')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(page.getByText('Orientation', { exact: true })).toBeVisible();
  expect(saved).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Confirm and save' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect.poll(() => saved).toBe(1);
});

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const id = '53800000-0000-4000-8000-000000000001';
const path = `/assessments/${id}`;

for (const mode of ['results', 'message', 'none'] as const) {
  test(`assessment presentation with final mode ${mode}`, async ({ page }) => {
    const width = mode === 'results' ? 1440 : 375;
    await page.setViewportSize({ width, height: 900 });
    const assessment = {
      id, title: 'Safety assessment', description: 'Read the instructions before starting.',
      status: 'published', passingScore: 70, timeLimitMinutes: 10, maxAttempts: null,
      presentation: {
        titleScreen: true, finalScreen: mode, completionMessage: 'Thank you for completing the assessment.',
        theme: { accent: '#ffff00', headingFont: 'georgia', bodyFont: 'verdana' },
      },
    };
    const question = { id: 'question-1', title: 'Choose the safest option', type: 'single_choice', order: 0, points: 1,
      options: [{ id: 'option-1', text: 'Check the equipment', order: 0 }] };
    let starts = 0;
    let submissions = 0;
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (url === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', locale: 'en', roles: ['learner'], firstName: 'Test', lastName: 'Learner' } });
      if (url.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (url === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
      if (url === path) return route.fulfill({ json: assessment });
      if (url === `${path}/quiz` || url === `${path}/questions`) return route.fulfill({ json: [question] });
      if (url === `${path}/attempts/start`) {
        starts++;
        const now = new Date().toISOString();
        return route.fulfill({ json: { id: 'attempt-1', startedAt: now, serverNow: now, questions: [question] } });
      }
      if (url === `${path}/attempts` && route.request().method() === 'POST') {
        submissions++;
        return route.fulfill({ json: { id: 'attempt-1' } });
      }
      if (url === '/attempts/attempt-1/result') return route.fulfill({
        json: { id: 'attempt-1', assessment, status: 'completed', passed: true, score: 1, maxScore: 1, percentage: 100, answers: [] },
      });
      return route.fulfill({ json: [] });
    });

    await page.goto(`/learn${path}/take`);
    const title = page.getByRole('heading', { name: assessment.title });
    await expect(title).toHaveCSS('font-family', 'Georgia, serif');
    await expect(page.getByText(assessment.description)).toBeVisible();
    const start = page.getByRole('button', { name: 'Start assessment' });
    await expect(start).toHaveCSS('background-color', 'rgb(255, 255, 0)');
    await expect(start).toHaveCSS('color', 'rgb(0, 0, 0)');
    expect(starts).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).include('.learner-quiz')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);

    await start.click();
    await page.getByRole('radio', { name: 'Check the equipment' }).check();
    expect(starts).toBe(1);
    await page.getByRole('button', { name: 'Submit answers' }).click();
    if (mode === 'none') {
      await expect(page).toHaveURL(new RegExp(`/learn${path}$`));
    } else {
      await expect(page.getByText(/Score: 1 \/ 1/)).toHaveCount(mode === 'results' ? 1 : 0);
      if (mode === 'message') await expect(page.getByText(assessment.presentation.completionMessage)).toBeVisible();
    }
    expect(submissions).toBe(1);
  });
}

test('assessment presentation uses the unsaved theme and final mode in author preview', async ({ page }) => {
  const assessment = {
    id, title: 'Preview assessment', status: 'draft', passingScore: 70, maxAttempts: null, timeLimitMinutes: null,
    updatedAt: '2026-11-26T00:00:00Z', presentation: { titleScreen: true },
  };
  const question = { id: 'question-1', title: 'Choose the safest option', type: 'single_choice', points: 1,
    definition: null, scoringMode: 'all_or_nothing', options: [{ id: 'option-1', text: 'Check the equipment', isCorrect: true }] };
  const writes: string[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (route.request().method() !== 'GET') writes.push(url);
    if (url === '/auth/me') return route.fulfill({ json: { id: 'author', organizationId: 'org', locale: 'en', roles: ['admin'], firstName: 'Test', lastName: 'Author' } });
    if (url.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (url === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (url === `${path}/editor`) return route.fulfill({ json: { assessment, questions: [question], draft: null, placements: [], assignments: [] } });
    if (url === `${path}/editor/preview`) return route.fulfill({
      json: [{ questionId: question.id, selectedOptionId: question.options[0].id, isCorrect: true, score: 1 }],
    });
    return route.fulfill({ json: [] });
  });

  await page.goto(`/admin${path}/edit?tab=main`);
  await page.getByLabel('Accent color (hex)').fill('#ffff00');
  await page.getByLabel('Heading font').selectOption('georgia');
  await page.getByLabel('Final screen').selectOption('message');
  await page.getByRole('button', { name: /preview from the beginning/i }).click();
  await expect(page.getByRole('heading', { name: assessment.title }).last()).toHaveCSS('font-family', 'Georgia, serif');
  const start = page.getByRole('button', { name: 'Start assessment' });
  await expect(start).toHaveCSS('background-color', 'rgb(255, 255, 0)');
  await start.click();
  await page.getByRole('radio', { name: 'Check the equipment' }).check();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByRole('heading', { name: 'Assessment completed' })).toBeVisible();
  expect(writes).toEqual([`${path}/editor/preview`]);
});

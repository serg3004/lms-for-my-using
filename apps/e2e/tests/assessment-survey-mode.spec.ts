import { expect, test, type Page } from '@playwright/test';

// PR 540: the survey mode of a test: the author's editor, the employee's pass without a verdict, and the report with the answer distribution.
const assessmentId = '54000000-0000-4000-8000-000000000001';
const questionId = '54000000-0000-4000-8000-000000000002';
const options = ['Совсем не согласен', 'Скорее не согласен', 'Затрудняюсь ответить', 'Скорее согласен', 'Полностью согласен']
  .map((text, order) => ({ id: `54000000-0000-4000-8000-00000000010${order}`, text, imageUrl: null, order, questionId }));
const organizationId = 'org-540';
const assessment = { id: assessmentId, organizationId, courseId: null, lessonId: null, title: 'Удовлетворённость работой', slug: 'survey', status: 'published', mode: 'survey',
  passingScore: 70, timeLimitMinutes: null, availableAfterCourseCompletion: false, maxAttempts: 1, showCorrectAnswers: false, randomizeOrder: false, createdAt: '2026-11-28T00:00:00Z', updatedAt: '2026-11-28T00:00:00Z' };
const question = { id: questionId, organizationId, assessmentId, title: 'Мне нравится моя работа', type: 'single_choice', text: null, points: 1, order: 0, options };

async function mock(page: Page, role: 'learner' | 'admin') {
  const writes: { path: string; body: unknown }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() !== 'GET') {
      writes.push({ path, body: request.postDataJSON() as unknown });
      if (path.endsWith('/attempts/start')) return route.fulfill({ json: { id: 'attempt-540', status: 'in_progress', startedAt: '2026-11-28T10:00:00Z', questions: [question] } });
      if (path.endsWith('/attempts/answer')) return route.fulfill({ json: {} });
      if (path.endsWith('/attempts')) return route.fulfill({ status: 201, json: { id: 'attempt-540' } });
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/me') return route.fulfill({ json: { id: 'user-540', organizationId, email: 'survey@example.invalid', firstName: 'Анна', lastName: 'Опросова', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === `/assessments/${assessmentId}`) return route.fulfill({ json: assessment });
    if (path === `/assessments/${assessmentId}/quiz`) return route.fulfill({ json: [question] });
    if (path === '/attempts/attempt-540/result') return route.fulfill({ json: { id: 'attempt-540', organizationId, assessmentId, userId: 'user-540', status: 'completed', score: 0, maxScore: 0, percentage: 0, passed: false,
      startedAt: '2026-11-28T10:00:00Z', completedAt: '2026-11-28T10:01:00Z', createdAt: '2026-11-28T10:00:00Z', updatedAt: '2026-11-28T10:01:00Z',
      assessment: { id: assessmentId, title: assessment.title, slug: 'survey', mode: 'survey', passingScore: 70, passMessage: null, failMessage: null }, user: { id: 'user-540', email: 'survey@example.invalid', firstName: 'Анна', lastName: 'Опросова' }, answers: [] } });
    if (path === `/assessments/${assessmentId}/editor`) return route.fulfill({ json: { assessment, questions: [{ ...question, imageUrl: null, scoringMode: 'all_or_nothing', definition: null,
      options: options.map((option) => ({ ...option, isCorrect: false })) }], draft: null, placements: [], assignments: [], hasAttempts: false } });
    if (path === `/assessments/${assessmentId}/survey-report`) return route.fulfill({ json: { assessment: { id: assessmentId, title: assessment.title }, respondents: 3, questions: [
      { id: questionId, type: 'single_choice', title: question.title, answered: 3, texts: [], options: options.map((option, index) => ({ id: option.id, text: option.text, count: index === 4 ? 2 : index === 0 ? 1 : 0, percent: index === 4 ? 67 : index === 0 ? 33 : 0 })) },
      { id: 'comment', type: 'short_answer', title: 'Что улучшить?', answered: 2, options: [], texts: [{ attemptId: 'a1', name: 'Опросова Анна', text: 'Больше обучения' }, { attemptId: 'a2', name: 'Тестов Борис', text: 'Гибкий график' }] },
    ] } });
    if (path === '/courses') return route.fulfill({ json: { items: [{ id: 'course-540', title: 'Охрана труда', organizationId, status: 'published' }], total: 1, page: 1, pageSize: 200 } });
    if (path === '/assessments') return route.fulfill({ json: [assessment] });
    if (path === '/assessment-analytics/layout') return route.fulfill({ json: { cards: [] } });
    return route.fulfill({ json: [] });
  });
  return writes;
}

test('an employee answers a survey and sees thanks instead of a score or a verdict', async ({ page }) => {
  const writes = await mock(page, 'learner');
  await page.goto(`/learn/assessments/${assessmentId}/take`);
  await expect(page.getByText(/Вопрос 1 из 1 · без оценки/)).toBeVisible();
  await expect(page.getByText(/проходной/i)).toHaveCount(0);
  await page.getByRole('radio', { name: 'Полностью согласен' }).check();
  await page.getByRole('button', { name: 'Отправить ответы' }).click();
  await expect(page.getByRole('status')).toContainText('Спасибо! Ваши ответы сохранены.');
  await expect(page.getByText(/Не сдан|Сдан|%/)).toHaveCount(0);
  expect(writes.some(({ path }) => path === `/assessments/${assessmentId}/attempts`)).toBe(true);
  await page.goto('/learn/attempts/attempt-540');
  await expect(page.getByRole('status')).toContainText('Спасибо! Ваши ответы сохранены.');
});

test('the author builds a survey from choice and text questions and the agreement scale', async ({ page }) => {
  await mock(page, 'admin');
  await page.goto(`/admin/assessments/${assessmentId}/edit?tab=questions`);
  const add = page.getByRole('button', { name: /^\+ / });
  await expect(page.getByRole('button', { name: '+ Шкала согласия (1–5)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Свободный ответ' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Соответствие' })).toHaveCount(0);
  await expect(add.filter({ hasText: 'Порядок' })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Шкала согласия (1–5)' }).click();
  await expect(page.getByRole('textbox', { name: 'Текст варианта' })).toHaveCount(5);
  await expect(page.getByRole('textbox', { name: 'Текст варианта' }).first()).toHaveValue('Совсем не согласен');
  await expect(page.getByRole('textbox', { name: 'Текст варианта' }).last()).toHaveValue('Полностью согласен');
  await expect(page.getByText('Правильный', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel('Баллы')).toHaveCount(0);
});

test('the report shows how the answers are distributed and who wrote each text', async ({ page }) => {
  await mock(page, 'admin');
  await page.goto(`/admin/assessments/analytics/${assessmentId}`);
  const report = page.getByTestId('survey-report');
  await expect(report).toContainText('3 сотрудника ответили');
  await expect(report).toContainText('не анонимный');
  await expect(report).toContainText('Полностью согласен');
  await expect(report).toContainText('67%');
  await expect(report).toContainText('Опросова Анна: Больше обучения');
  await expect(page.getByText('Процент сдачи')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /XLSX/ })).toBeEnabled();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('choosing a survey makes the test standalone and hides the points, the passing score and the pass window', async ({ page }) => {
  await mock(page, 'admin');
  await page.goto('/admin/assessments/new');
  const standalone = page.getByRole('checkbox', { name: /самостоятельный тест/i });
  await expect(standalone).not.toBeChecked();
  await page.getByLabel('Тип', { exact: true }).selectOption('survey');
  await expect(standalone).toBeChecked();
  await expect(standalone).toBeDisabled();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('Макс. попыток', { exact: false })).toHaveValue('1');
  await expect(page.getByLabel('Проходной балл', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel('Какая попытка считается')).toHaveCount(0);
});

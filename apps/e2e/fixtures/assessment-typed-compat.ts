import { expect, type Page } from '@playwright/test';

export const typedAssessmentId = '38800000-0000-4000-8000-000000000001';
export const typedQuestionMessage = 'Вопросы этого теста пока недоступны в этой форме. Обратитесь к организатору обучения.';
export async function openTypedAssessment(page: Page, { role = 'learner', type = 'ordering', locale = 'ru', custom }: { role?: 'learner' | 'admin'; type?: string; locale?: 'ru' | 'en' | 'kk' | 'zh'; custom?: Record<string, unknown> } = {}) {
  const writes: string[] = [];
  const assessment = { id: typedAssessmentId, organizationId: 'org-388', courseId: 'course-388', title: 'Проверка знаний', slug: 'typed-quiz', status: 'published', passingScore: 70, timeLimitMinutes: 10, availableAfterCourseCompletion: false, maxAttempts: 1, showCorrectAnswers: false, randomizeOrder: false, createdAt: '2026-10-31T00:00:00Z' };
  const displayItems = [{ id: 'a', text: 'Проверить оборудование' }, { id: 'b', text: 'Начать работу' }];
  const definition = custom ?? (type === 'true_false' ? { type: 'true_false' }
    : type === 'matching' ? { type: 'matching', left: displayItems, right: displayItems }
    : type === 'fill_blank' ? { type: 'fill_blank', blanks: [{ id: 'city' }], caseSensitive: true, whitespace: 'exact' }
    : type === 'short_answer' ? { type: 'short_answer', caseSensitive: true, whitespace: 'trim' }
    : { type: 'ordering', items: displayItems, ...(role === 'admin' ? { correctOrder: ['b', 'a'] } : {}) });
  const question = { id: '38800000-0000-4000-8000-000000000002', organizationId: assessment.organizationId, assessmentId: typedAssessmentId, title: 'Порядок действий', type, text: null, points: 8, order: 0, options: [], definition: role === 'admin' ? definition : { ...definition, unsupported: true } };
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (route.request().method() !== 'GET') { writes.push(path); return route.fulfill({ status: 400, json: { message: 'Must not submit unsupported questions' } }); }
    if (path === '/auth/me') return route.fulfill({ json: { id: 'user-388', organizationId: assessment.organizationId, email: 'question@example.invalid', firstName: 'Анна', lastName: 'Тест', roles: [role], locale, timezone: 'UTC', status: 'active' } });
    if (path.startsWith('/assessment-images/')) return route.fulfill({ json: { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#dbeafe"/></svg>')}` } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === `/assessments/${typedAssessmentId}`) return route.fulfill({ json: assessment });
    if (path === `/assessments/${typedAssessmentId}/editor`) return route.fulfill({ json: {
      assessment: { ...assessment, updatedAt: assessment.createdAt },
      questions: [{ ...question, imageUrl: null, scoringMode: 'all_or_nothing' }], draft: null, placements: [], assignments: [],
    } });
    if (path === `/assessments/${typedAssessmentId}/quiz` || path === `/assessments/${typedAssessmentId}/questions`) return route.fulfill({ json: [question] });
    if (path === '/assessment-folders') return route.fulfill({ json: { folders: [], rootAssessmentCount: 1, assessmentCount: 1 } });
    if (path === '/assessments/library') return route.fulfill({ json: { items: [{ ...assessment, questionsCount: 1, attemptsCount: 0, courseTitle: 'Охрана труда' }], total: 1, page: 1, pageSize: 25 } });
    if (path === '/assessments') return route.fulfill({ json: [assessment] });
    if (path === '/courses') return route.fulfill({ json: { items: [{ id: assessment.courseId, title: 'Охрана труда', organizationId: assessment.organizationId, status: 'published' }], total: 1, page: 1, pageSize: 200 } });
    if (path.endsWith('/report')) return route.fulfill({ json: { attemptsCount: 0, passedCount: 0, failedCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto(role === 'learner' ? `/learn/assessments/${typedAssessmentId}/take` : '/admin/assessments');
  if (role === 'learner') await expect(page.getByText(locale === 'ru' ? typedQuestionMessage : { en: 'This form does not support', kk: 'Бұл пішін', zh: '此表单暂不支持' }[locale], { exact: locale === 'ru' })).toBeVisible();
  else await expect(page.getByRole('row', { name: /Проверка знаний/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { writes };
}

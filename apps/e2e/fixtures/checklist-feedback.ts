import { expect, type Page } from '@playwright/test';
import type { FeedbackConfig } from '@lms/shared/checklist-feedback';
import type { ChecklistAnswerSet } from '../../web/src/shared/api/types.js';
import { openPreviewBuilder, previewSheet } from './checklist-preview.js';
import { installCriterionScaleMocks } from './criterion-scales.js';
import { sessionReportFixture } from './session-report.js';

export const answerSet = (overrides: Partial<ChecklistAnswerSet> = {}): ChecklistAnswerSet => ({
  id: 'readiness', organizationId: 'preview-org', name: 'Готовность к работе', status: 'active', createdBy: 'viewer',
  createdAt: '2026-01-01T00:00:00Z', inUse: false, usageCount: 0, usedByChecklists: [],
  options: [{ id: 'ready', name: 'Готов', description: 'Работает самостоятельно' }, { id: 'practice', name: 'Практика', description: 'Нужна поддержка наставника' }], ...overrides,
});
export function feedbackConfig(): FeedbackConfig {
  return { layout: { title: 'План развития', fields: [{ id: 'note', title: 'Рекомендация', kind: 'text', required: true }], sections: [
    { id: 'skills', title: 'Навыки', fields: [], sections: [{ id: 'practice', title: 'Практика', fields: [], sections: [
      { id: 'plan', title: 'Следующая смена', sections: [], fields: [{ id: 'verdict', title: 'Итог наблюдения', kind: 'choice', answerSetId: 'readiness', multiple: true, required: true }] },
    ] }] },
  ] }, answerSets: { readiness: answerSet() } };
}
export async function openFeedbackBuilder(page: Page, locale = 'ru') {
  const sheet = previewSheet(); sheet.feedbackLayout = feedbackConfig().layout;
  sheet.items = sheet.items.slice(0, 1).map((item) => ({ ...item, groupId: null, photoRequired: false })); sheet.itemGroups = []; sheet.contextFields = [];
  await openPreviewBuilder(page, sheet, locale, [answerSet()]);
  await page.locator('.admin-feedback-block').scrollIntoViewIfNeeded();
  return sheet;
}
export async function openFeedbackConduct(page: Page) {
  const data = await installCriterionScaleMocks(page, 'instructor');
  data.checklist.items.splice(1); data.checklist.feedbackEnabled = true; data.session.feedback = feedbackConfig(); data.session.feedbackAnswers = {};
  data.instance.results = [{ id: 'result-quality', itemId: 'quality', checked: true, scaleLevel: 4, points: 40, answerState: 'answered', photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null }];
  const saves: Record<string, unknown>[] = [];
  await page.route('**/api/v1/checklist-sessions/scale-session**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/feedback')) {
      const body = route.request().postDataJSON(); saves.push(body);
      data.session.feedbackAnswers = { ...data.session.feedbackAnswers, ...body.answers }; data.session.version++;
      return route.fulfill({ json: data.session });
    }
    if (path.endsWith('/complete')) { data.session.status = 'completed'; data.instance.status = 'completed'; data.session.version++; return route.fulfill({ json: data.session }); }
    if (path.endsWith('/events') || path.endsWith('/location-captures') || path.endsWith('/score-revisions')) return route.fulfill({ json: [] });
    if (path.endsWith('/scale-session')) return route.fulfill({ json: data.session });
    if (path.endsWith('/report')) return route.fulfill({ json: sessionReportFixture(data.session, { feedbackForm: { ...data.session.feedback!, answers: data.session.feedbackAnswers! } }) });
    return route.fallback();
  });
  await page.goto('/instructor/checklists/sessions/scale-session');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(page.getByLabel('Рекомендация *', { exact: true })).toBeVisible();
  return { ...data, saves };
}

export function answerSetServer(role: 'admin' | 'instructor' | 'mentor' = 'admin', locale = 'ru') {
  const base = role === 'admin' ? '/admin/checklists/answer-sets' : role === 'instructor' ? '/instructor/checklists/answer-sets' : '/mentor/answer-sets';
  const items = [answerSet()]; let failure = 0;
  const writes: { method: string; body: Record<string, unknown> | null }[] = [];
  return { items, writes, base, fail: (status: number) => { failure = status; }, attach: async (page: Page, suffix = '') => {
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', ''), method = route.request().method();
      if (path === '/auth/me') return route.fulfill({ json: { id: 'viewer', organizationId: 'preview-org', firstName: 'Анна', lastName: 'Автор', email: 'viewer@example.invalid', roles: [role], locale, timezone: 'UTC', status: 'active' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
      if (!path.startsWith('/checklist-answer-sets')) return route.fulfill({ json: { items: [], total: 0 } });
      if (failure) { const status = failure; failure = 0; return route.fulfill({ status, json: { message: 'Synthetic answer-set failure' } }); }
      const [, , id, action] = path.split('/'), item = items.find((value) => value.id === id);
      if (method === 'GET') return id ? item ? route.fulfill({ json: item }) : route.fulfill({ status: 404, json: { message: 'Not found' } }) : route.fulfill({ json: items });
      const body = route.request().postData() ? route.request().postDataJSON() : null; writes.push({ method, body });
      if (!id) { const created = answerSet({ ...body, id: `new-${writes.length}` }); items.push(created); return route.fulfill({ json: created }); }
      if (!item) return route.fulfill({ status: 404, json: { message: 'Not found' } });
      if (action === 'copy') { const copy = answerSet({ ...item, ...body, id: `copy-${writes.length}`, status: 'active', inUse: false, usageCount: 0 }); items.push(copy); return route.fulfill({ json: copy }); }
      if (action === 'archive') item.status = 'archived';
      else if (method === 'DELETE') { if (item.inUse) return route.fulfill({ status: 409, json: { message: 'In use' } }); items.splice(items.indexOf(item), 1); return route.fulfill({ status: 204 }); }
      else Object.assign(item, body);
      return route.fulfill({ json: item });
    });
    await page.goto(`${base}${suffix}`); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } };
}

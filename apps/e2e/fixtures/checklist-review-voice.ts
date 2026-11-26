import { expect, type Page } from '@playwright/test';

/** PR 512: a fake speech recognition (the real one needs the internet and a microphone). */
export const fakeRecognition = () => {
  type Handlers = { onresult?: (event: unknown) => void; onerror?: (event: { error: string }) => void; onend?: () => void };
  const state: { last: Handlers | null } = { last: null };
  class FakeRecognition implements Handlers {
    onresult?: Handlers['onresult']; onerror?: Handlers['onerror']; onend?: Handlers['onend'];
    constructor() { state.last = this; }
    start() {}
    stop() { this.onend?.(); }
    abort() {}
  }
  Object.assign(window, {
    SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition,
    __say: (text: string, isFinal: boolean) => { const list = [Object.assign([{ transcript: text }], { isFinal, length: 1 })]; state.last?.onresult?.({ resultIndex: 0, results: Object.assign(list, { length: 1 }) }); },
  });
};

type Note = { id: string; itemId: string | null; place: 'answer' | 'reviewer_comment' | 'summary'; field: string | null; durationMs: number; sizeBytes: number; createdBy: string; createdAt: string };

/** The reviewer's screen with one submitted check: a learner's recording, a comment field and the review call. */
export async function openReviewVoice(page: Page) {
  const notes: Note[] = [{ id: 'learner-note', itemId: 'item-1', place: 'answer', field: null, durationMs: 6000, sizeBytes: 400, createdBy: 'learner', createdAt: '2026-10-01T12:00:00Z' }];
  const calls: Array<{ kind: string; body?: unknown }> = [];
  const result = { id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: 'Полка в порядке', reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'answered' };
  const instance = {
    id: 'instance', organizationId: 'org', checklistId: 'sheet', userId: 'learner', assignedBy: null, reviewerId: 'reviewer', reviewAssignedAt: '2026-10-01T12:00:00Z', reviewAssignedBy: 'reviewer',
    status: 'submitted', totalScore: 10, maxScore: 10, percentage: 100, passed: true, dueAt: null, submittedAt: '2026-10-01T12:00:00Z', completedAt: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
    checklist: { id: 'sheet', organizationId: 'org', title: 'Проверка витрины', description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 50, scaleLevels: null, requiresReview: true, createdBy: null, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
      items: [{ id: 'item-1', checklistId: 'sheet', order: 0, text: 'Полка выложена', points: 10, isRequired: true, photoRequired: false }] },
    results: [result],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'reviewer', organizationId: 'org', email: 'reviewer@example.invalid', firstName: 'Ирина', lastName: 'Проверяющая', roles: ['instructor'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklist-instances/review-queue') return route.fulfill({ json: { items: [instance], total: 1, page: 1, pageSize: 20 } });
    if (path === '/checklists/analytics') return route.fulfill({ json: { assignmentsTotal: 1, counts: { assigned: 0, in_progress: 0, submitted: 1, completed: 0, expired: 0 }, completionRate: 0, passRate: 0, averagePercentage: 0, expiredRate: 0, pendingReview: 1, averageCompletionTimeMs: 0, averageReviewTimeMs: 0 } });
    if (path === '/checklist-instances/instance/events') return route.fulfill({ json: [] });
    if (path === '/checklist-instances/instance/voice-settings') return route.fulfill({ json: { dictation: true, voiceNotes: true, maxSeconds: 120, perComment: 3 } });
    if (path === '/checklist-instances/instance/voice-notes' && method === 'GET') return route.fulfill({ json: notes });
    if (path === '/checklist-instances/instance/items/item-1/voice-notes' && method === 'POST') {
      const body = route.request().postData() ?? '';
      calls.push({ kind: 'upload', body: { place: /name="place"\r\n\r\n([a-z_]+)/.exec(body)?.[1] ?? null } });
      const created: Note = { id: 'reviewer-note', itemId: 'item-1', place: 'reviewer_comment', field: null, durationMs: 2000, sizeBytes: 400, createdBy: 'reviewer', createdAt: '2026-10-01T12:10:00Z' };
      notes.push(created);
      return route.fulfill({ json: created });
    }
    if (/\/voice-notes\/[^/]+\/file$/.test(path)) return route.fulfill({ status: 200, contentType: 'audio/webm', body: Buffer.alloc(400) });
    if (path === '/checklist-instances/instance/items/item-1/review' && method === 'POST') {
      calls.push({ kind: 'review', body: route.request().postDataJSON() });
      return route.fulfill({ json: { ...instance, results: [{ ...result, reviewStatus: 'approved' }] } });
    }
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/instructor/checklists');
  await page.getByText('Проверка витрины').click();
  await expect(page.getByText('Полка выложена').first()).toBeVisible();
  return { calls, notes };
}

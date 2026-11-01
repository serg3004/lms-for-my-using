import { expect, type Page } from '@playwright/test';
import type { CompletionReason, LongreadCompletion } from '@lms/shared/longread-progress';
import type { LongreadReaderDocument } from '../../web/src/shared/api/longreads.js';
import { exerciseReaderServer, exerciseDraft } from './longread-exercises.js';
import { longreadEditorServer, longreadFixture, longreadLessonId } from './longread-editor.js';
export const gateA = '39000000-0000-4000-8000-000000000001', gateB = '39000000-0000-4000-8000-000000000002';
export function progressReaderServer(options: { mode?: 'free' | 'answered' | 'correct'; seconds?: number; fileUnavailable?: boolean } = {}) {
  const exercises = exerciseReaderServer(), draft = exerciseDraft(), passed = new Set<string>(), completed = new Set<string>();
  let cursor = 'intro', elapsed = 0, missingFile = options.fileUnavailable ?? false;
  const writes: Record<string, unknown>[] = [], requests: string[] = [];
  const a = draft.chapters[0]!.blocks[0]!, b = draft.chapters[0]!.blocks[1]!;
  const gate = (id: string) => ({ id, type: 'continue', schemaVersion: 1, content: { mode: options.mode ?? 'correct', minViewSeconds: options.seconds ?? 0 } });
  exercises.state.tests = [];
  function reasons(indices: number[]): CompletionReason[] {
    const result: CompletionReason[] = [];
    if (options.mode !== 'free') for (const index of indices) {
      const item = exercises.state.exercises[index]!;
      if (!item.attemptsUsed) result.push({ code: 'unanswered' });
      else if (options.mode !== 'answered' && !item.lastResult?.isCorrect) result.push({ code: item.remaining ? 'incorrect' : 'exhausted' });
    }
    if (elapsed < (options.seconds ?? 0)) result.push({ code: 'time', remainingSeconds: (options.seconds ?? 0) - elapsed });
    return result;
  }
  function summary(): LongreadCompletion {
    const gates = [gateA, gateB].map((blockId, index) => ({ blockId, passed: passed.has(blockId), reasons: passed.has(blockId) ? [] : [...(index && !passed.has(gateA) ? [{ code: 'continue_required' as const }] : []), ...reasons(index ? [0, 1] : [0])] }));
    const currentReasons: CompletionReason[] = [...gates.filter((g) => !g.passed).map((g) => ({ code: 'continue_required' as const, blockId: g.blockId })), ...gates.flatMap((g) => g.reasons), ...(missingFile ? [{ code: 'file_unavailable' as const }] : [])];
    const required = ['intro', 'second'];
    const count = required.filter((c) => completed.has(c)).length;
    return { version: 1, completed: count === 2, percentage: count * 50, requiredCount: 2, completedCount: count, chapters: ['intro', 'second', 'optional'].map((anchor, index) => ({ anchor, title: ['Первая глава', 'Вторая глава', 'Дополнительная глава'][index], required: index < 2,
      completedAt: completed.has(anchor) ? '2026-11-01T00:00:00.000Z' : null, accessible: index === 0 || completed.has('intro'), gates: index === 0 ? gates : [], reasons: completed.has(anchor) ? [] : index === 0 ? currentReasons : completed.has('intro') ? [] : [{ code: 'locked' }] })) };
  }
  function view(): LongreadReaderDocument {
    const completion = summary(), index = ['intro', 'second', 'optional'].indexOf(cursor);
    return { lessonId: longreadLessonId, version: 1, preview: false, schemaVersion: 1, settings: { ...draft.settings, readingOrder: 'free', requiredChapters: 2 }, completion,
      chapters: [{ anchor: 'intro', title: 'Первая глава', blocks: passed.has(gateA) ? [a, gate(gateA), b, gate(gateB)] : [a, gate(gateA)] }, { anchor: 'second', title: 'Вторая глава', blocks: completed.has('intro') ? [{ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'Вторая глава' }] } }] : [] }, { anchor: 'optional', title: 'Дополнительная глава', blocks: [] }],
      navigation: { chapter: cursor, headingIndex: null, allowedAnchors: completion.chapters.filter((c) => c.accessible).map((c) => c.anchor), previousAnchor: index ? ['intro', 'second'][index - 1]! : null, nextAnchor: index === 0 && completed.has('intro') ? 'second' : null } };
  }
  return { exercises, writes, requests, view, summary, setElapsed: (value: number) => { elapsed = value; }, setFileUnavailable: (value: boolean) => { missingFile = value; },
    attach: async (page: Page, locale: 'ru' | 'en' | 'kk' | 'zh' = 'ru') => {
      await exercises.attach(page, locale);
      await page.route('**/api/v1/**/longread/published*', (route) => { requests.push(route.request().url()); return route.fulfill({ json: view() }); });
      await page.route('**/api/v1/**/longread/position', (route) => { const body = route.request().postDataJSON() as { chapter: string }; if (!summary().chapters.find((c) => c.anchor === body.chapter)?.accessible) return route.fulfill({ status: 404, json: { message: 'Locked' } }); cursor = body.chapter; return route.fulfill({ json: view() }); });
      await page.route('**/api/v1/**/longread/completion', (route) => {
        const input = route.request().postDataJSON() as { chapter: string; blockId?: string; version: number }; writes.push(input);
        const chapter = summary().chapters.find((c) => c.anchor === input.chapter);
        if (input.version !== 1 || !chapter?.accessible) return route.fulfill({ status: 409, json: { message: 'Changed' } });
        const blocked = input.blockId ? chapter.gates.find((g) => g.blockId === input.blockId)?.reasons.length : chapter.reasons.length;
        if (blocked) return route.fulfill({ status: 422, json: { message: 'Blocked' } });
        if (input.blockId) passed.add(input.blockId); else completed.add(input.chapter);
        return route.fulfill({ json: view() });
      });
      await page.reload(); await expect(page.getByRole('button', { name: locale === 'ru' ? 'Продолжить' : locale === 'en' ? 'Continue' : locale === 'kk' ? 'Жалғастыру' : '继续', exact: true })).toBeVisible();
    } };
}
export function continueEditorServer() {
  const draft = structuredClone(longreadFixture); draft.chapters[0]!.blocks = [{ id: gateA, type: 'continue', schemaVersion: 1, known: true, content: { mode: 'correct', minViewSeconds: 30 } }];
  return longreadEditorServer(draft);
}
export async function openContinuePreview(page: Page) {
  const server = continueEditorServer(); await server.attach(page);
  const requests: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET') requests.push(request.url()); });
  await page.route('**/api/v1/**/longread/preview?*', (route) => route.fulfill({ json: { lessonId: longreadLessonId, version: null, draftRevision: 1, schemaVersion: 1, preview: true, settings: server.snapshot().settings, chapters: server.snapshot().chapters, navigation: { chapter: 'intro', headingIndex: null, allowedAnchors: ['intro', 'practice'], previousAnchor: null, nextAnchor: 'practice' } } }));
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); return requests;
}

export async function openProgressReport(page: Page) {
  const summary = progressReaderServer({ fileUnavailable: true }).summary();
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Анна', lastName: 'Автор', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/courses') return route.fulfill({ json: { items: [{ id: 'course', organizationId: 'org', title: 'Курс с лонгридом' }], page: 1, pageSize: 200, total: 1 } });
    if (path === '/users') return route.fulfill({ json: { items: [{ id: 'learner', email: 'learner@example.invalid', name: 'Ученик' }], page: 1, pageSize: 200, total: 1 } });
    if (path === '/assessments') return route.fulfill({ json: [] });
    if (path === '/reports/summary') return route.fulfill({ json: { progress: [{ id: 'progress', status: 'in_progress', score: 0, completedAt: null, lesson: { id: longreadLessonId, title: 'Лонгрид: безопасность' }, longread: summary, course: { id: 'course', title: 'Курс с лонгридом' }, user: { id: 'learner', firstName: 'Алексей', lastName: 'Ученик', email: 'learner@example.invalid' } }], certificates: [], overdueAssignments: [], counts: { progressTotal: 1, progressCompletedTotal: 0, progressAvgScore: 0, certificatesIssuedTotal: 0, overdueTotal: 0 } } });
    return route.fulfill({ status: 404, json: { message: 'Unknown synthetic progress route' } });
  });
  await page.goto('/admin/results'); await page.locator('details[data-longread-progress] > summary').first().click(); await expect(page.getByRole('region', { name: 'Состояние прохождения' }).first()).toBeVisible();
}

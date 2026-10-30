import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type { LongreadDraft, SaveLongread } from '../../web/src/shared/api/longreads.js';

export const longreadLessonId = '38300000-0000-4000-8000-000000000001';
export const longreadCourseId = '38300000-0000-4000-8000-000000000002';
export const longreadFixture: LongreadDraft = {
  lessonId: longreadLessonId, revision: 1, schemaVersion: 1,
  settings: { readingOrder: 'free', requiredChapters: 0, tableOfContents: 'expanded', direction: 'ltr', allowCopy: true },
  chapters: [
    { id: '38300000-0000-4000-8000-000000000003', title: 'Введение', hidden: false, anchor: 'intro', blocks: [
      { id: '38300000-0000-4000-8000-000000000004', type: 'paragraph', schemaVersion: 1, known: true, title: null, hidden: false, content: { runs: [{ text: 'Безопасная работа', bold: true }, { text: ' начинается с подготовки. ' }, { text: 'Инструкция', italic: true, underline: true, href: 'https://example.invalid/guide' }] } },
      { id: '38300000-0000-4000-8000-000000000005', type: 'list', schemaVersion: 1, known: true, title: null, hidden: false, content: { ordered: false, items: [{ level: 1, runs: [{ text: 'Проверить оборудование' }] }, { level: 2, runs: [{ text: 'Осмотреть кабель' }] }, { level: 3, runs: [{ text: 'Убедиться в целостности' }] }] } },
      { id: '38300000-0000-4000-8000-000000000006', type: 'code', schemaVersion: 1, known: true, title: null, hidden: false, content: { language: 'javascript', code: 'const ready = true;\n// Код остаётся текстом' } },
    ] },
    { id: '38300000-0000-4000-8000-000000000007', title: 'Практика', hidden: false, anchor: 'practice', blocks: [] },
  ],
};

/** A synthetic draft server for browser/visual/axe tests. Real CAS/tenant checks live in DB tests. */
export function longreadEditorServer(initial: LongreadDraft = longreadFixture) {
  let stored = structuredClone(initial), failure = 0;
  const writes: SaveLongread[] = [];
  let held: (() => void) | null = null, hold = false;
  async function attach(page: Page, options: { locale?: 'ru' | 'en' | 'kk' | 'zh'; role?: 'admin' | 'instructor'; denied?: number } = {}) {
    const role = options.role ?? 'admin';
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const method = route.request().method();
      if (path === '/auth/me') return route.fulfill({ json: { id: 'author', organizationId: 'org', email: 'author@example.invalid', firstName: 'Анна', lastName: 'Автор', roles: [role], locale: options.locale ?? 'ru', timezone: 'UTC', status: 'active' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
      if (path.endsWith('/features')) return route.fulfill({ json: { longreadEnabled: true } });
      if (path === `/lessons/${longreadLessonId}`) return route.fulfill({ json: { id: longreadLessonId, courseId: longreadCourseId, title: 'Безопасная работа', type: 'longread', status: 'draft', order: 0 } });
      if (path === `/lessons/${longreadLessonId}/longread`) {
        if (options.denied) return route.fulfill({ status: options.denied, json: { message: 'Not available' } });
        if (method === 'GET') return route.fulfill({ json: stored });
        if (method === 'PUT') {
          const body = route.request().postDataJSON() as SaveLongread;
          writes.push(body);
          if (hold) await new Promise<void>((resolve) => { held = resolve; });
          if (failure) { const status = failure; failure = 0; return route.fulfill({ status, json: { message: 'Fixture failure' } }); }
          if (body.revision !== stored.revision) return route.fulfill({ status: 409, json: { message: 'Changed by someone else', currentRevision: stored.revision } });
          stored = { ...stored, revision: stored.revision + 1, settings: body.settings, chapters: body.chapters.map((chapter) => ({ ...chapter, id: chapter.id ?? randomUUID(), anchor: stored.chapters.find((c) => c.id === chapter.id)?.anchor ?? `ch-${randomUUID()}`,
            blocks: chapter.blocks.map((block) => ({ ...block, id: block.id ?? randomUUID(), known: true })) })) };
          return route.fulfill({ json: stored });
        }
      }
      return route.fulfill({ status: 404, json: { message: 'Unknown synthetic editor route' } });
    });
    await page.goto(`/${role}/lessons/${longreadLessonId}/longread`);
    if (!options.denied) {
      await expect(page.getByRole('heading', { level: 1, name: 'Безопасная работа' })).toBeVisible();
      await expect(page.locator('.tiptap')).toBeVisible();
    }
  }
  return { attach, writes, snapshot: () => structuredClone(stored), failNext: (status: number) => { failure = status; },
    pause: () => { hold = true; }, resume: () => { hold = false; held?.(); held = null; } };
}

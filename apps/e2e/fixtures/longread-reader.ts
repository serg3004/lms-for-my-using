import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { LongreadDraft, LongreadReaderDocument } from '../../web/src/shared/api/longreads.js';
import { longreadCourseId, longreadEditorServer, longreadFixture, longreadLessonId } from './longread-editor.js';

export function readerDraft(): LongreadDraft {
  const draft = structuredClone(longreadFixture);
  const block = (id: number, type: string, content: Record<string, unknown>) => ({ id: `38500000-0000-4000-8000-${String(id).padStart(12, '0')}`, type, schemaVersion: 1, known: true, content, title: null, hidden: false });
  draft.chapters[0]!.anchor = 'intro';
  draft.chapters[0]!.blocks = [
    block(1, 'heading', { level: 2, runs: [{ text: 'Подготовка' }] }),
    block(2, 'heading', { level: 3, runs: [{ text: 'Проверка оборудования' }] }),
    block(3, 'heading', { level: 2, runs: [{ text: 'Только в тексте' }], excludeFromToc: true }),
    block(4, 'paragraph', { runs: [{ text: 'Русский · Қазақша · 中文 · العربية 2026. ', bold: true }, { text: 'Инструкция 123', href: 'https://example.invalid/guide/123' }] }),
    block(5, 'list', { ordered: false, items: [{ level: 1, runs: [{ text: 'Проверить оборудование' }] }, { level: 2, runs: [{ text: 'Осмотреть кабель' }] }, { level: 3, runs: [{ text: 'Проверить изоляцию' }] }] }),
    block(6, 'code', { language: 'javascript', code: 'const ready = true;\n// Код не исполняется' }),
    { ...block(7, 'paragraph', { runs: [{ text: 'SECRET HIDDEN BLOCK' }] }), hidden: true },
  ];
  draft.chapters[1]!.anchor = 'practice';
  draft.chapters[1]!.blocks = [block(8, 'heading', { level: 2, runs: [{ text: 'Практическая часть' }] }), block(9, 'paragraph', { runs: [{ text: 'Вторая глава. Внимательно следуйте инструкции.' }] }),
    block(10, 'quote', { runs: [{ text: 'Сначала безопасность.' }], caption: 'Инструктор' }), block(11, 'note', { runs: [{ text: 'Проверьте питание перед работой.' }], tone: 'warning' }), block(12, 'divider', {})];
  draft.chapters.push({ id: '38500000-0000-4000-8000-000000000003', anchor: 'finish', title: 'Итоги', hidden: false, blocks: [block(13, 'paragraph', { runs: [{ text: 'Третья глава. Итоги занятия.' }] })] });
  draft.chapters.push({ id: '38500000-0000-4000-8000-000000000004', anchor: 'hidden', title: 'SECRET HIDDEN CHAPTER', hidden: true, blocks: [block(14, 'paragraph', { runs: [{ text: 'SECRET HIDDEN CONTENT' }] })] });
  return draft;
}
function document(draft: LongreadDraft, chapter: string, headingIndex: number | null, preview: boolean, maxReached: number): LongreadReaderDocument {
  const visible = draft.chapters.filter((item) => !item.hidden);
  const index = visible.findIndex((item) => item.anchor === chapter);
  return { lessonId: draft.lessonId, version: preview ? null : 1, preview, schemaVersion: 1, settings: draft.settings,
    chapters: visible.map((item, position) => ({ title: item.title, anchor: item.anchor, blocks: !preview && draft.settings.readingOrder === 'sequential' && position > maxReached ? [] : item.blocks.filter((block) => !block.hidden) })),
    navigation: { chapter, headingIndex, previousAnchor: visible[index - 1]?.anchor ?? null, nextAnchor: visible[index + 1]?.anchor ?? null,
      allowedAnchors: visible.slice(0, preview || draft.settings.readingOrder === 'free' ? visible.length : maxReached + 2).map((item) => item.anchor) } };
}

/** Synthetic UI transport only; authorization and monotonic state are tested against PostgreSQL. */
export function longreadReaderServer(settings: Partial<LongreadDraft['settings']> = {}) {
  const draft = readerDraft(); draft.settings = { ...draft.settings, ...settings };
  let cursor = { chapter: 'intro', headingIndex: null as number | null, maxReached: 0 };
  let fail = 0;
  const writes: { path: string; body: Record<string, unknown> }[] = [], reads: string[] = [];
  async function attach(page: Page, options: { locale?: 'ru' | 'en' | 'kk' | 'zh'; hash?: string; denied?: number } = {}) {
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', ''), method = route.request().method();
      if (method === 'GET') reads.push(path);
      if (path === '/auth/me') return route.fulfill({ json: { id: 'reader-385', organizationId: 'reader-org', email: 'reader@example.invalid', firstName: 'Алексей', lastName: 'Сотрудников', roles: ['learner'], locale: options.locale ?? 'ru', timezone: 'UTC', status: 'active' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
      const lesson = { id: longreadLessonId, organizationId: 'reader-org', courseId: longreadCourseId, title: 'Безопасная работа', type: 'longread', status: 'published', order: 0 };
      if (path === `/lessons/${longreadLessonId}`) return route.fulfill({ json: lesson });
      if (path === `/courses/${longreadCourseId}`) return route.fulfill({ json: { id: longreadCourseId, title: 'Охрана труда', status: 'published', organizationId: 'reader-org' } });
      if (path === `/courses/${longreadCourseId}/lessons`) return route.fulfill({ json: [lesson] });
      if (path === `/lessons/${longreadLessonId}/longread/published`) {
        if (options.denied) return route.fulfill({ status: options.denied, json: { message: 'Unavailable' } });
        const chapter = url.searchParams.get('chapter') ?? cursor.chapter;
        const index = draft.chapters.filter((item) => !item.hidden).findIndex((item) => item.anchor === chapter);
        if (index < 0 || draft.settings.readingOrder === 'sequential' && index > cursor.maxReached) return route.fulfill({ status: 404, json: { message: 'Unavailable chapter' } });
        return route.fulfill({ json: document(draft, chapter, chapter === cursor.chapter ? cursor.headingIndex : null, false, cursor.maxReached) });
      }
      if (method !== 'GET') {
        const body = route.request().postDataJSON() as Record<string, unknown>; writes.push({ path, body });
        if (path === `/lessons/${longreadLessonId}/longread/position`) {
          if (fail && body.mode === 'navigate') { const status = fail; fail = 0; return route.fulfill({ status, json: { message: 'Fixture failure' } }); }
          const index = draft.chapters.filter((item) => !item.hidden).findIndex((item) => item.anchor === body.chapter);
          if (index < 0 || draft.settings.readingOrder === 'sequential' && index > cursor.maxReached + 1) return route.fulfill({ status: 404, json: { message: 'Unavailable chapter' } });
          if (body.mode === 'bookmark' && body.chapter !== cursor.chapter) return route.fulfill({ status: 409, json: { message: 'Chapter changed' } });
          cursor = { chapter: String(body.chapter), headingIndex: typeof body.headingIndex === 'number' ? body.headingIndex : null, maxReached: Math.max(index, cursor.maxReached) };
          return route.fulfill({ json: document(draft, cursor.chapter, cursor.headingIndex, false, cursor.maxReached) });
        }
      }
      return route.fulfill({ status: 404, json: { message: 'Unknown synthetic reader route' } });
    });
    await page.goto(`/learn/lessons/${longreadLessonId}${options.hash ?? ''}`);
    if (!options.denied && !options.hash?.includes('hidden') && !(settings.readingOrder === 'sequential' && options.hash?.includes('finish'))) {
      await expect(page.locator('.longread-reader')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Безопасная работа' })).toBeVisible();
    }
  }
  return { attach, reads, writes, cursor: () => ({ ...cursor }), failNext: (status: number) => { fail = status; }, draft };
}

export async function openLongreadPreview(page: Page, options: { role?: 'admin' | 'instructor'; direction?: 'ltr' | 'rtl'; chapter?: number } = {}) {
  const draft = readerDraft(); draft.settings.direction = options.direction ?? 'ltr';
  const editor = longreadEditorServer(draft); await editor.attach(page, { role: options.role });
  const forbiddenWrites: string[] = [], previewReads: string[] = [];
  page.on('request', (req) => { if (req.method() !== 'GET' && /\/(progress|assessment-attempts|certificates|position)(?:\?|$|\/)/.test(new URL(req.url()).pathname)) forbiddenWrites.push(req.url()); });
  await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/preview?*`, (route) => {
    const current = editor.snapshot(), id = new URL(route.request().url()).searchParams.get('chapterId');
    const selected = current.chapters.find((chapter) => chapter.id === id && !chapter.hidden) ?? current.chapters[0]!;
    previewReads.push(route.request().url());
    return route.fulfill({ json: document(current, selected.anchor, null, true, current.chapters.length - 1) });
  });
  if ((options.chapter ?? 0) > 0) await page.getByRole('navigation', { name: 'Главы', exact: true }).getByRole('button', { name: `${options.chapter! + 1}. ${draft.chapters[options.chapter!]!.title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Предпросмотр/ });
  await expect(dialog.locator('.longread-reader')).toBeVisible();
  return { dialog, forbiddenWrites, previewReads, editor };
}

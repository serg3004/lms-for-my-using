import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { longreadEditorServer, longreadFixture, longreadLessonId } from './longread-editor.js';
import { longreadReaderServer } from './longread-reader.js';
import type { LongreadDraft, LongreadFile } from '../../web/src/shared/api/longreads.js';
export const mediaId = (n: number) => `38600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const mediaImage = (fileId = mediaId(1)) => ({ fileId, alt: 'Защитное оборудование', caption: 'Проверка оборудования перед работой', width: 100, align: 'center' as const });
export function mediaDraft(): LongreadDraft {
  const draft = structuredClone(longreadFixture); draft.settings.cover = { ...mediaImage(), caption: 'Обложка документа' };
  draft.chapters[0]!.cover = { ...mediaImage(mediaId(2)), width: 75, caption: 'Обложка главы' };
  draft.chapters[0]!.blocks = [
    { id: mediaId(10), type: 'image', schemaVersion: 1, known: true, title: null, hidden: false, content: mediaImage(mediaId(2)) },
    { id: mediaId(11), type: 'attachments', schemaVersion: 1, known: true, title: null, hidden: false, content: { files: [{ fileId: mediaId(3), label: 'Инструкция по безопасности.pdf' }] } },
  ]; return draft;
}
export function longreadFileServer() {
  const records = new Map<string, LongreadFile>([
    [mediaId(1), { id: mediaId(1), fileName: 'cover.png', mimeType: 'image/png', sizeBytes: 200, scanStatus: 'available' }],
    [mediaId(2), { id: mediaId(2), fileName: 'equipment.png', mimeType: 'image/png', sizeBytes: 200, scanStatus: 'available' }],
    [mediaId(3), { id: mediaId(3), fileName: 'Инструкция по безопасности.pdf', mimeType: 'application/pdf', sizeBytes: 200, scanStatus: 'available' }],
  ]);
  const learningWrites: string[] = [];
  const batches: unknown[][] = [], uploaded: string[] = [], signed: string[] = [], multipartParts: number[] = []; let denied = false;
  async function install(page: Page) {
    page.on('request', (req) => { if (req.method() !== 'GET' && /\/(progress|assessment-attempts|certificates|position)(?:\?|$|\/)/.test(new URL(req.url()).pathname)) learningWrites.push(req.url()); });
    await page.route('**/mock-longread-files/**', (route) => route.fulfill({ contentType: 'image/png', body: readFileSync(new URL('./assets/longread-safety.png', import.meta.url)) }));
    await page.route('**/mock-longread-parts/*', (route) => { multipartParts.push(route.request().postDataBuffer()?.length ?? 0); return route.fulfill({ status: 200, headers: { ETag: '"synthetic-part-etag"' } }); });
    await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/files**`, async (route) => {
      const url = new URL(route.request().url()), path = url.pathname.split('/files')[1]!, method = route.request().method();
      if (!path && method === 'POST') {
        const body = route.request().postDataJSON() as { files: { fileName: string; mimeType: string; sizeBytes: number }[] }; batches.push(body.files);
        if (body.files.length > 20) return route.fulfill({ status: 400, json: { message: 'Too many files' } });
        const created = body.files.map((file) => ({ ...file, id: randomUUID(), scanStatus: 'pending' as const })); created.forEach((file) => records.set(file.id, file)); return route.fulfill({ json: created });
      }
      const [id, operation, uploadId, finish] = path.slice(1).split('/'), file = records.get(id!);
      if (!file) return route.fulfill({ status: 404, json: { message: 'No file' } });
      if (!operation) return route.fulfill({ json: file });
      if (operation === 'content') { uploaded.push(file.id); file.scanStatus = 'available'; return route.fulfill({ json: file }); }
      if (operation === 'multipart') {
        if (method === 'DELETE') return route.fulfill({ json: { aborted: true } });
        if (uploadId && finish === 'complete') { uploaded.push(file.id); file.scanStatus = 'available'; return route.fulfill({ json: file }); }
        return route.fulfill({ json: { uploadId: randomUUID(), partSizeBytes: 8 * 1024 * 1024, parts: Array.from({ length: Math.ceil(file.sizeBytes / (8 * 1024 * 1024)) }, (_, i) => ({ partNumber: i + 1, url: `http://127.0.0.1:5173/mock-longread-parts/${i + 1}` })) } });
      }
      if (operation === 'download' || operation === 'preview') {
        if (denied || file.scanStatus !== 'available') return route.fulfill({ status: 404, json: { message: 'Unavailable file' } });
        signed.push(file.id); return route.fulfill({ json: { url: `http://127.0.0.1:5173/mock-longread-files/${file.id}.png`, expiresIn: 300, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
  }
  async function readyImages(page: Page) {
    for (const image of await page.getByRole('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  async function editor(page: Page, options: { role?: 'admin' | 'instructor'; locale?: 'ru' | 'en' | 'kk' | 'zh'; empty?: boolean } = {}) {
    const server = longreadEditorServer(options.empty ? structuredClone(longreadFixture) : mediaDraft()); await server.attach(page, { ...options, beforeNavigate: () => install(page) });
    await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/preview?*`, (route) => {
      const draft = server.snapshot(), chapter = draft.chapters.find((item) => item.id === new URL(route.request().url()).searchParams.get('chapterId')) ?? draft.chapters[0]!;
      return route.fulfill({ json: { ...draft, preview: true, version: null, navigation: { chapter: chapter.anchor, headingIndex: null, allowedAnchors: draft.chapters.map((item) => item.anchor), previousAnchor: null, nextAnchor: draft.chapters[1]?.anchor ?? null } } });
    });
    if (!options.empty) await readyImages(page);
    return server;
  }
  async function reader(page: Page, direction: 'ltr' | 'rtl' = 'ltr') {
    const server = longreadReaderServer({ direction }); const source = mediaDraft();
    server.draft.settings.cover = source.settings.cover; server.draft.chapters[0]!.cover = source.chapters[0]!.cover; server.draft.chapters[0]!.blocks = source.chapters[0]!.blocks;
    await server.attach(page, { beforeNavigate: () => install(page) });
    await expect(page.getByAltText('Защитное оборудование').first()).toBeVisible(); await readyImages(page); return server;
  }
  return { editor, reader, install, records, learningWrites, batches, uploaded, signed, multipartParts, deny: () => { denied = true; } };
}

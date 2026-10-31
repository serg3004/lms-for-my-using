import { readFileSync } from 'node:fs';
import { expect, type Page, type Route } from '@playwright/test';
import { longreadFileServer, mediaId } from './longread-files.js';
import { longreadEditorServer, longreadFixture, longreadLessonId } from './longread-editor.js';
import { longreadReaderServer } from './longread-reader.js';
import type { LongreadDraft } from '../../web/src/shared/api/longreads.js';

export const playbackFiles = {
  mp3: { id: mediaId(101), name: 'longread-audio.mp3', mime: 'audio/mpeg' },
  wav: { id: mediaId(102), name: 'longread-audio.wav', mime: 'audio/wav' },
  mp4: { id: mediaId(103), name: 'longread-video.mp4', mime: 'video/mp4' },
  webm: { id: mediaId(104), name: 'longread-video.webm', mime: 'video/webm' },
};
export function playbackDraft(reader = false): LongreadDraft {
  const draft = structuredClone(longreadFixture);
  draft.chapters[0]!.blocks = [
    { id: mediaId(110), type: 'audio', known: true, schemaVersion: 1, content: { fileId: playbackFiles.mp3.id, caption: 'Подготовка к работе — аудио' } },
    ...(reader ? [{ id: mediaId(111), type: 'audio', known: true, schemaVersion: 1, content: { fileId: playbackFiles.wav.id, caption: 'Инструкция в WAV' } }] : []),
    { id: mediaId(112), type: 'video', known: true, schemaVersion: 1, content: { source: 'file', fileId: playbackFiles.mp4.id, poster: { fileId: mediaId(1) }, caption: 'Правила безопасности — видео', width: 100 } },
    ...(reader ? [{ id: mediaId(113), type: 'video', known: true, schemaVersion: 1, content: { source: 'file', fileId: playbackFiles.webm.id, poster: null, caption: 'Видео WebM', width: 75 } },
      { id: mediaId(114), type: 'video', known: true, schemaVersion: 1, content: { source: 'url', url: 'https://media.example.com/clip.mp4', poster: null, caption: 'Внешний видеофайл', width: 100 } }] : []),
    { id: mediaId(115), type: 'embed', known: true, schemaVersion: 1, content: { source: { provider: 'youtube', videoId: 'abcdefghijk' }, caption: 'Объяснение на YouTube', width: 100 } },
  ];
  draft.chapters[1]!.blocks = [{ id: mediaId(116), type: 'audio', known: true, schemaVersion: 1, content: { fileId: playbackFiles.wav.id, caption: 'Аудио второй главы' } }];
  return draft;
}

export function longreadPlaybackServer() {
  const files = longreadFileServer(); const signed: string[] = [], ranges: string[] = [], resolved: string[] = [];
  let denied = false, externalFailure = false, ttl = 300;
  for (const file of Object.values(playbackFiles)) files.records.set(file.id, { id: file.id, fileName: file.name, mimeType: file.mime, sizeBytes: readFileSync(new URL(`./assets/${file.name}`, import.meta.url)).length, scanStatus: 'available' });
  async function serve(route: Route, name: string, contentType: string) {
    const bytes = readFileSync(new URL(`./assets/${name}`, import.meta.url));
    const range = route.request().headers()['range'];
    const match = range?.match(/^bytes=(\d+)-(\d*)$/); const start = Number(match?.[1] ?? 0), end = Math.min(bytes.length - 1, Number(match?.[2] || bytes.length - 1));
    if (range) ranges.push(range);
    if (start >= bytes.length || start > end) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    const body = bytes.subarray(start, end + 1);
    return route.fulfill({ status: match ? 206 : 200, contentType, body, headers: { 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Content-Length': String(body.length), 'Access-Control-Allow-Origin': '*', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  }
  async function install(page: Page) {
    await files.install(page);
    await page.route('**/mock-longread-playback/*', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
      const asset = Object.values(playbackFiles).find((item) => item.name === name);
      return asset ? serve(route, asset.name, asset.mime) : route.fulfill({ status: 404 });
    });
    await page.route('https://media.example.com/clip.mp4', (route) => externalFailure ? route.abort('failed') : serve(route, playbackFiles.mp4.name, playbackFiles.mp4.mime));
    await page.route('https://www.youtube-nocookie.com/embed/*', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Synthetic provider</title><body><p>Synthetic provider player</p></body></html>' }));
    await page.route('https://player.vimeo.com/video/*', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Synthetic provider</title><body><p>Synthetic provider player</p></body></html>' }));
    await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/files/**`, (route) => {
      const url = new URL(route.request().url()), [id, operation] = url.pathname.split('/files/')[1]!.split('/');
      const record = files.records.get(id!); if (!record || !['preview', 'download'].includes(operation!)) return route.fallback();
      const asset = Object.values(playbackFiles).find((item) => item.mime === record.mimeType); if (!asset) return route.fallback();
      if (denied || record.scanStatus !== 'available') return route.fulfill({ status: 404, json: { message: 'No media access' } });
      signed.push(id!);
      return route.fulfill({ json: { url: `http://127.0.0.1:5173/mock-longread-playback/${asset.name}?signature=${signed.length}`, expiresIn: ttl, fileName: record.fileName, mimeType: record.mimeType, sizeBytes: record.sizeBytes } });
    });
    await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/embed/resolve`, (route) => {
      const input = route.request().postDataJSON().input as string; resolved.push(input);
      if (input === 'https://vimeo.com/123456789') return route.fulfill({ json: { provider: 'vimeo', videoId: '123456789' } });
      if (input === 'https://youtu.be/abcdefghijk' || input === '<iframe src="https://www.youtube.com/embed/abcdefghijk" allowfullscreen></iframe>') return route.fulfill({ json: { provider: 'youtube', videoId: 'abcdefghijk' } });
      return route.fulfill({ status: 400, json: { message: 'Synthetic invalid source' } });
    });
  }
  async function ready(page: Page) {
    await page.evaluate(() => document.fonts.ready);
    for (const audio of await page.locator('audio[src]').all()) await expect.poll(() => audio.evaluate((element) => (element as HTMLAudioElement).duration)).toBeGreaterThan(40);
    for (const video of await page.locator('video[src]').all()) await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('video[poster]')].map(async (video) => { const image = new Image(); image.src = (video as HTMLVideoElement).poster; await image.decode(); }));
    });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  async function editor(page: Page, options: { empty?: boolean; role?: 'admin' | 'instructor'; locale?: 'ru' | 'en' | 'kk' | 'zh' } = {}) {
    const server = longreadEditorServer(options.empty ? structuredClone(longreadFixture) : playbackDraft());
    await server.attach(page, { ...options, beforeNavigate: () => install(page) });
    await page.route(`**/api/v1/lessons/${longreadLessonId}/longread/preview?*`, (route) => {
      const draft = server.snapshot(), chapter = draft.chapters[0]!;
      return route.fulfill({ json: { ...draft, preview: true, version: null, navigation: { chapter: chapter.anchor, headingIndex: null, allowedAnchors: draft.chapters.map((item) => item.anchor), previousAnchor: null, nextAnchor: draft.chapters[1]?.anchor ?? null } } });
    });
    if (!options.empty) await ready(page); return server;
  }
  async function reader(page: Page, options: { direction?: 'ltr' | 'rtl'; locale?: 'ru' | 'en' | 'kk' | 'zh' } = {}) {
    const server = longreadReaderServer({ direction: options.direction ?? 'ltr' }); const draft = playbackDraft(true);
    server.draft.chapters[0]!.blocks = draft.chapters[0]!.blocks; server.draft.chapters[1]!.blocks = draft.chapters[1]!.blocks;
    await server.attach(page, { locale: options.locale, beforeNavigate: () => install(page) }); await ready(page); return server;
  }
  return { files, signed, ranges, resolved, editor, reader, deny: () => { denied = true; }, allow: () => { denied = false; }, expireAfter: (seconds: number) => { ttl = seconds; }, failExternal: () => { externalFailure = true; }, recoverExternal: () => { externalFailure = false; } };
}

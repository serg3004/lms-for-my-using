import { expect, test } from '@playwright/test';
import { longreadPlaybackServer, playbackFiles } from '../fixtures/longread-playback.js';

const asset = (name: string) => new URL(`../fixtures/assets/${name}`, import.meta.url).pathname;

test('MP3 and WAV really decode, play and pause from the keyboard, seek and skip 15 seconds', async ({ page }) => {
  const server = longreadPlaybackServer(); await server.reader(page);
  const groups = page.getByRole('group', { name: 'Управление аудио', exact: true });
  await expect(groups).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const group = groups.nth(i), audio = page.locator('audio').nth(i);
    await group.getByRole('button', { name: 'Воспроизвести', exact: true }).focus(); await page.keyboard.press('Space');
    await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    await group.getByRole('button', { name: 'Пауза', exact: true }).press('Enter');
    await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).paused)).toBe(true);
    const seek = group.getByRole('slider', { name: /^Позиция воспроизведения/ });
    await seek.focus(); await page.keyboard.press('Home'); await group.getByRole('button', { name: 'Вперёд на 15 секунд' }).click();
    await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeCloseTo(15, 0);
    await group.getByRole('button', { name: 'Назад на 15 секунд' }).click();
    await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeCloseTo(0, 0);
    await seek.focus(); await page.keyboard.press('End'); await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(44);
  }
  expect(server.ranges.some((value) => value.startsWith('bytes='))).toBe(true);
});

test('volume and mute use real media properties and audio speed is shared across players and chapters', async ({ page }) => {
  const server = longreadPlaybackServer(); await server.reader(page);
  const group = page.getByRole('group', { name: 'Управление аудио', exact: true }).first(), audio = page.locator('audio').first();
  await group.getByRole('slider', { name: 'Громкость', exact: true }).press('Home');
  await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).volume)).toBe(0);
  await group.getByRole('slider', { name: 'Громкость', exact: true }).press('ArrowRight');
  await expect.poll(() => audio.evaluate((node) => (node as HTMLAudioElement).volume)).toBeCloseTo(0.01, 2);
  await group.getByRole('button', { name: 'Выключить звук', exact: true }).click();
  expect(await audio.evaluate((node) => (node as HTMLAudioElement).muted)).toBe(true);
  await group.getByRole('button', { name: 'Включить звук', exact: true }).click();
  expect(await audio.evaluate((node) => (node as HTMLAudioElement).muted)).toBe(false);
  for (const value of ['0.75', '1', '1.25', '1.5', '1.75', '2']) {
    await group.getByRole('combobox', { name: 'Скорость (общая для аудио лонгрида)' }).selectOption(value);
    await expect.poll(() => page.locator('audio').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAudioElement).playbackRate))).toEqual([Number(value), Number(value)]);
  }
  await page.getByRole('combobox', { name: 'Главы', exact: true }).selectOption({ index: 1 });
  await expect(page.locator('audio')).toHaveCount(1);
  await expect.poll(() => page.locator('audio').evaluate((node) => (node as HTMLAudioElement).playbackRate)).toBe(2);
});

test('MP4, WebM and a direct HTTPS video really load and can be played', async ({ page }) => {
  await longreadPlaybackServer().reader(page);
  const videos = page.locator('video'); await expect(videos).toHaveCount(3);
  for (const video of await videos.all()) {
    await video.scrollIntoViewIfNeeded(); await video.press('Space');
    await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await video.press('Space');
    await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  }
  await expect(videos.first()).toHaveAttribute('poster', /mock-longread-files/);
});

test('an expired signed URL is refreshed before play without losing position or shared speed', async ({ page }) => {
  const server = longreadPlaybackServer(); server.expireAfter(1); await server.reader(page);
  const group = page.getByRole('group', { name: 'Управление аудио', exact: true }).first();
  await group.getByRole('button', { name: 'Вперёд на 15 секунд' }).click();
  await group.getByRole('combobox').selectOption('1.5'); const count = server.signed.length;
  await page.clock.install(); await page.clock.fastForward(2000);
  await group.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect.poll(() => server.signed.length).toBeGreaterThan(count);
  await expect.poll(() => page.locator('audio').first().evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(15);
  await expect.poll(() => page.locator('audio').first().evaluate((node) => (node as HTMLAudioElement).playbackRate)).toBe(1.5);
});

test('revoked access cannot refresh a signed URL and retry recovers after access returns', async ({ page }) => {
  const server = longreadPlaybackServer(); server.expireAfter(1); await server.reader(page);
  server.deny(); await page.clock.install(); await page.clock.fastForward(2000);
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Медиа недоступно');
  expect(await page.locator('audio').first().getAttribute('src')).toBeNull();
  server.allow(); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('audio').first()).toHaveAttribute('src', /mock-longread-playback/);
});

test('quarantined audio is never assigned a playable URL', async ({ page }) => {
  const server = longreadPlaybackServer(); server.files.records.get(playbackFiles.mp3.id)!.scanStatus = 'pending'; await server.reader(page);
  await expect(page.getByRole('alert')).toContainText('Медиа недоступно');
  expect(await page.locator('audio').first().getAttribute('src')).toBeNull();
  expect(server.signed).not.toContain(playbackFiles.mp3.id);
});

test('an unavailable external video shows retry and an explicit fallback without breaking the reader', async ({ page }) => {
  const server = longreadPlaybackServer(); await server.reader(page); server.failExternal();
  await page.locator('video').last().evaluate((node) => (node as HTMLVideoElement).load());
  await expect(page.getByRole('alert')).toContainText('Медиа недоступно');
  await expect(page.getByRole('link', { name: 'Открыть источник в новой вкладке' }).first()).toHaveAttribute('href', 'https://media.example.com/clip.mp4');
  server.recoverExternal(); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect.poll(() => page.locator('video').last().evaluate((node) => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('group', { name: 'Управление аудио', exact: true }).first()).toBeVisible();
});

test('external players load only after a click with a canonical URL, sandbox and a persistent fallback', async ({ page }) => {
  await longreadPlaybackServer().reader(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Загрузить видео YouTube', exact: true }).click();
  const frame = page.locator('iframe');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  expect(await frame.getAttribute('srcdoc')).toBeNull();
  await expect(page.getByRole('link', { name: 'Открыть источник в новой вкладке' }).last()).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
});

test('a failed provider frame leaves the source link usable and other media working', async ({ page }) => {
  await longreadPlaybackServer().reader(page);
  await page.route('https://www.youtube-nocookie.com/embed/*', (route) => route.abort('failed'));
  const failed = page.waitForEvent('requestfailed', (request) => request.url().startsWith('https://www.youtube-nocookie.com/embed/'));
  await page.getByRole('button', { name: 'Загрузить видео YouTube', exact: true }).click(); await failed;
  await expect(page.getByRole('link', { name: 'Открыть источник в новой вкладке' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).first().click();
  await expect.poll(() => page.locator('audio').first().evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
});

test('the editor replaces iframe HTML with the server identity and preserves it after reload', async ({ page }) => {
  const server = longreadPlaybackServer(), editor = await server.editor(page);
  await page.getByLabel('Ссылка YouTube/Vimeo или код iframe', { exact: true }).fill('<iframe src="https://www.youtube.com/embed/abcdefghijk" allowfullscreen></iframe>');
  await page.getByRole('button', { name: 'Применить источник', exact: true }).click();
  await expect.poll(() => server.resolved.length).toBeGreaterThan(0);
  expect(JSON.stringify(editor.snapshot())).not.toContain('<iframe');
  await page.getByLabel('Ссылка YouTube/Vimeo или код iframe', { exact: true }).fill('https://vimeo.com/123456789');
  await page.getByRole('button', { name: 'Применить источник', exact: true }).click();
  await expect.poll(() => JSON.stringify(editor.snapshot())).toContain('123456789');
  await page.reload(); await expect(page.getByRole('button', { name: 'Загрузить видео Vimeo', exact: true })).toBeVisible();
});

test('dangerous iframe input stays text and rejection never overwrites the saved source', async ({ page }) => {
  const server = longreadPlaybackServer(), editor = await server.editor(page); const before = editor.snapshot();
  for (const input of ['javascript:window.mediaAttack=1', '<iframe srcdoc="<script>window.mediaAttack=1</script>"></iframe>', '<iframe src="https://evil.example"></iframe>']) {
    await page.getByLabel('Ссылка YouTube/Vimeo или код iframe', { exact: true }).fill(input);
    await page.getByRole('button', { name: 'Применить источник', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Источник не принят');
  }
  expect(editor.snapshot()).toEqual(before); expect(await page.evaluate(() => (window as unknown as { mediaAttack?: number }).mediaAttack)).toBeUndefined();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('audio upload uses the existing pipeline and creates a playable draft block', async ({ page }) => {
  const server = longreadPlaybackServer(), editor = await server.editor(page, { empty: true });
  await page.getByRole('navigation', { name: 'Главы', exact: true }).getByRole('button', { name: '2. Практика', exact: true }).click();
  await page.getByLabel('Тип нового блока', { exact: true }).selectOption('audio'); await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
  await page.getByLabel('Загрузить или заменить аудио', { exact: true }).setInputFiles(asset('longread-audio.mp3'));
  await expect.poll(() => server.files.uploaded.length).toBe(1);
  await expect.poll(() => page.locator('audio').evaluate((node) => (node as HTMLAudioElement).duration)).toBeGreaterThan(40);
  await expect.poll(() => editor.snapshot().chapters[1]!.blocks[0]?.content.fileId).toEqual(expect.any(String));
  expect(server.files.batches[0]).toEqual([expect.objectContaining({ mimeType: 'audio/mpeg' })]);
});

test('video upload, poster, caption, width and external source survive draft save', async ({ page }) => {
  const server = longreadPlaybackServer(), editor = await server.editor(page, { empty: true });
  await page.getByRole('navigation', { name: 'Главы', exact: true }).getByRole('button', { name: '2. Практика', exact: true }).click();
  await page.getByLabel('Тип нового блока', { exact: true }).selectOption('video'); await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
  await page.getByLabel('Загрузить или заменить видео', { exact: true }).setInputFiles(asset('longread-video.mp4'));
  await page.locator('summary').filter({ hasText: /^Постер видео$/ }).click();
  await page.getByLabel('Загрузить или заменить изображение', { exact: true }).setInputFiles(asset('longread-safety.png'));
  await page.getByLabel('Подпись', { exact: true }).fill('Описание видео'); await page.getByLabel('Ширина, %', { exact: true }).fill('75');
  await expect.poll(() => editor.snapshot().chapters[1]!.blocks[0]?.content.width).toBe(75);
  expect(editor.snapshot().chapters[1]!.blocks[0]!.content).toMatchObject({ caption: 'Описание видео', poster: { fileId: expect.any(String) } });
  await page.getByLabel('Источник видео', { exact: true }).selectOption('url');
  await page.getByLabel('Адрес видео MP4/WebM', { exact: true }).fill('javascript:alert(1)');
  await expect(page.getByRole('alert')).toContainText('Изменения пока не отправлены');
  await page.getByLabel('Адрес видео MP4/WebM', { exact: true }).fill('https://media.example.com/clip.mp4');
  await expect.poll(() => editor.snapshot().chapters[1]!.blocks[0]!.content.source).toBe('url');
  expect(editor.snapshot().chapters[1]!.blocks[0]!.content).not.toHaveProperty('fileId');
});

test('author media preview never writes learner progress or attempts', async ({ page }) => {
  const server = longreadPlaybackServer(); await server.editor(page);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); const preview = page.getByRole('dialog');
  await expect(preview.locator('audio')).toHaveCount(1);
  await preview.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await expect.poll(() => preview.locator('audio').evaluate((node) => (node as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  expect(server.files.learningWrites).toEqual([]);
});

for (const [locale, play, speed] of [['en', 'Play', 'Speed (shared by longread audio)'], ['kk', 'Ойнату', 'Жылдамдық (лонгрид аудиосына ортақ)'], ['zh', '播放', '速度（长文阅读音频共用）']] as const) test(`audio controls use ${locale} labels`, async ({ page }) => {
  await longreadPlaybackServer().reader(page, { locale });
  await expect(page.getByRole('button', { name: play, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: speed, exact: true }).first()).toBeVisible();
});

for (const width of [375, 768]) test(`media fits at ${width}px including RTL`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await longreadPlaybackServer().reader(page, { direction: width === 768 ? 'rtl' : 'ltr' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const clipped = await page.locator('.longread-reader figure, .longread-reader button, .longread-reader input').evaluateAll((nodes) => nodes.filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth); }).map((node) => node.tagName));
  expect(clipped).toEqual([]);
});

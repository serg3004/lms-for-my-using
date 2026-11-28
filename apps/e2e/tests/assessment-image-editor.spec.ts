import { deflateSync } from 'node:zlib';

import { expect, test, type Locator, type Page } from '@playwright/test';

// PR 541: the author edits a question picture in the browser, saves it as a new file and can bring the original back.
const assessmentId = '54100000-0000-4000-8000-000000000001';
const questionId = '54100000-0000-4000-8000-000000000002';
const originalId = '54100000-0000-4000-8000-0000000000a1.png';
const editedId = '54100000-0000-4000-8000-0000000000b2.png';
const organizationId = 'org-541';
const assessment = { id: assessmentId, organizationId, courseId: null, lessonId: null, title: 'Знаки безопасности', slug: 'signs', status: 'draft', mode: 'graded',
  passingScore: 70, timeLimitMinutes: null, availableAfterCourseCompletion: false, maxAttempts: 3, showCorrectAnswers: false, randomizeOrder: false, createdAt: '2026-11-28T00:00:00Z', updatedAt: '2026-11-28T00:00:00Z' };

function png(width: number, height: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x88);
  for (let y = 0; y < height; y++) rows[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const question = { id: questionId, organizationId, assessmentId, title: 'Что означает знак?', type: 'single_choice', text: null, points: 1, order: 0, imageUrl: null, scoringMode: 'all_or_nothing', definition: null,
  material: JSON.stringify({ kind: 'file', fileId: originalId, caption: '', alt: '' }),
  options: [0, 1].map((order) => ({ id: `54100000-0000-4000-8000-00000000010${order}`, text: `Вариант ${order + 1}`, imageUrl: null, order, questionId, isCorrect: order === 0 })) };

async function mock(page: Page) {
  const uploads: { type: string | undefined }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'POST' && path === '/assessment-images') {
      uploads.push({ type: request.headers()['content-type'] });
      return route.fulfill({ status: 201, json: { id: editedId } });
    }
    if (request.method() !== 'GET') return route.fulfill({ json: {} });
    if (path === '/auth/me') return route.fulfill({ json: { id: 'user-541', organizationId, email: 'author@example.invalid', firstName: 'Ольга', lastName: 'Автор', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path.endsWith('/content')) return route.fulfill({ body: png(300, 200), contentType: 'image/png' });
    if (path.startsWith('/assessment-images/')) return route.fulfill({ json: { url: `data:image/png;base64,${png(30, 20).toString('base64')}` } });
    if (path === `/assessments/${assessmentId}`) return route.fulfill({ json: assessment });
    if (path === `/assessments/${assessmentId}/editor`) return route.fulfill({ json: { assessment, questions: [question], draft: null, placements: [], assignments: [], hasAttempts: false } });
    if (path === '/courses') return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 200 } });
    return route.fulfill({ json: [] });
  });
  return uploads;
}

async function openEditor(page: Page) {
  await page.goto(`/admin/assessments/${assessmentId}/edit?tab=questions`);
  await page.getByRole('button', { name: 'Редактировать', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Материал к вопросу' }).locator('xpath=following::summary[1]').click();
  await page.getByRole('button', { name: 'Редактировать изображение' }).click();
  const dialog = page.getByRole('dialog', { name: 'Редактор изображения' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('canvas')).toBeVisible();
  return dialog;
}

async function drag(page: Page, dialog: Locator, from: [number, number], to: [number, number]) {
  const box = (await dialog.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}

test('the author draws on a question picture, undoes a step, saves it as a new file and restores the original', async ({ page }) => {
  const uploads = await mock(page);
  const dialog = await openEditor(page);
  await dialog.getByRole('button', { name: 'Прямоугольник' }).click();
  await drag(page, dialog, [0.2, 0.2], [0.6, 0.6]);
  await dialog.getByRole('button', { name: 'Стрелка' }).click();
  await drag(page, dialog, [0.1, 0.8], [0.9, 0.3]);
  const undo = dialog.getByRole('button', { name: 'Отменить шаг' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await dialog.getByRole('button', { name: 'Нумерация' }).click();
  const box = (await dialog.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await dialog.getByRole('button', { name: 'Обрезка' }).click();
  await drag(page, dialog, [0.1, 0.1], [0.8, 0.8]);
  await dialog.getByRole('button', { name: 'Сохранить как новое' }).click();
  await expect(dialog).toBeHidden();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.type).toContain('multipart/form-data');
  await expect(page.getByRole('button', { name: 'Вернуть исходное' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть исходное' }).click();
  await expect(page.getByRole('button', { name: 'Вернуть исходное' })).toHaveCount(0);
});

test('the editor fits a phone screen and every tool is a comfortable touch target', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await mock(page);
  const dialog = await openEditor(page);
  for (const name of ['Прямоугольник', 'Стрелка', 'Текст', 'Обрезка', 'Лупа', 'Затемнение', 'Пикселизация', 'Заливка области', 'Нумерация', 'Выделение области']) {
    const button = dialog.getByRole('button', { name });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Текст' }).click();
  const canvas = (await dialog.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 20, canvas.y + 20);
  await dialog.getByRole('textbox', { name: 'Текст на картинке' }).fill('Выход');
  await dialog.getByRole('button', { name: 'Добавить текст' }).click();
  await expect(dialog.getByRole('button', { name: 'Отменить шаг' })).toBeEnabled();
});

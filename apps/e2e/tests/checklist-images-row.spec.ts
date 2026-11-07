import { expect, test } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

// PR 436: on «Основное» the images of the form stand right next to the thumbnail (24 px apart), not in the middle of the page.
test('1280px: images block starts 24 px to the right of the thumbnail, is 320–520 px wide, tops are aligned', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFormattingEditor(page);
  const row = page.getByTestId('checklist-images');
  const cover = row.getByRole('group', { name: 'Миниатюра чек-листа' });
  const photos = row.getByRole('group', { name: /Изображение на бланке чек-листа/ });
  const c = (await cover.boundingBox())!;
  const p = (await photos.boundingBox())!;
  expect(Math.abs(p.x - (c.x + c.width) - 24)).toBeLessThanOrEqual(8);
  expect(p.width).toBeGreaterThanOrEqual(320);
  expect(p.width).toBeLessThanOrEqual(520);
  expect(Math.abs(p.y - c.y)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const width of [390, 320]) test(`${width}px: images block goes under the thumbnail, nothing overflows`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openFormattingEditor(page);
  const row = page.getByTestId('checklist-images');
  const c = (await row.getByRole('group', { name: 'Миниатюра чек-листа' }).boundingBox())!;
  const p = (await row.getByRole('group', { name: /Изображение на бланке чек-листа/ }).boundingBox())!;
  expect(p.y).toBeGreaterThanOrEqual(c.y + c.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

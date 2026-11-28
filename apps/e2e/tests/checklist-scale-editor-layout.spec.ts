import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { scaleLibraryServer } from '../fixtures/scale-library.js';

// PR 579: the scale editor page -- levels in even rows, one colour field, one navigation, drag by the handle.
async function openNewScale(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await scaleLibraryServer().attach(page);
  await page.getByRole('link', { name: 'Новая шкала', exact: true }).click();
  await expect(page.getByLabel('Название уровня 1', { exact: true })).toBeVisible();
}
const levelCards = (page: Page) => page.locator('ol.scale-levels > li');

test('all levels have one height, the colour field never opens or moves rows, and the preview stands beside the levels', async ({ page }) => {
  await openNewScale(page, 1280);
  const heights = async () => Promise.all((await levelCards(page).all()).map(async (card) => Math.round((await card.boundingBox())!.height)));
  const before = await heights();
  expect(new Set(before).size).toBe(1);
  await page.getByRole('button', { name: 'Цвет уровня 1: #1565C0', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Цвет уровня 1: #1565C0', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await heights()).toEqual(before);
  await expect(page.getByLabel('Цвет уровня 1: код #RRGGBB', { exact: true })).toHaveValue('#1565C0');
  // One colour square-picker per level, not two identical squares.
  await expect(levelCards(page).first().locator('input[type="color"]')).toHaveCount(1);
  const levels = (await levelCards(page).first().boundingBox())!, preview = (await page.getByRole('region', { name: 'Предпросмотр', exact: true }).boundingBox())!;
  expect(preview.x).toBeGreaterThanOrEqual(levels.x + levels.width);
  await expect(page.locator('.scale-levels__head')).toContainText('Название');
  await expect(page.locator('.scale-levels__head')).toContainText('Баллы');
});

test('one navigation: no breadcrumbs, a "back to scales" link instead', async ({ page }) => {
  await openNewScale(page, 1280);
  await expect(page.locator('main').getByRole('navigation', { name: 'Хлебные крошки' })).toHaveCount(0);
  await page.getByRole('link', { name: '← К шкалам', exact: true }).click();
  await expect(page).toHaveURL(/\/scales$/);
  await expect(page.getByRole('link', { name: '← К шкалам', exact: true })).toHaveCount(0);
});

test('a level is dragged by its handle with the mouse and the order changes at once', async ({ page }) => {
  await openNewScale(page, 1280);
  await page.getByLabel('Название уровня 1', { exact: true }).fill('Первый');
  await page.getByLabel('Название уровня 2', { exact: true }).fill('Второй');
  const handle = page.getByRole('button', { name: 'Перетащить уровень 1', exact: true }), second = (await levelCards(page).nth(1).boundingBox())!;
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(from.x + from.width / 2, second.y + second.height - 4, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByLabel('Название уровня 1', { exact: true })).toHaveValue('Второй');
  await expect(page.getByLabel('Название уровня 2', { exact: true })).toHaveValue('Первый');
});

for (const width of [320, 375]) {
  test(`level cards stay inside the screen and never overflow at ${width}px`, async ({ page }) => {
    await openNewScale(page, width);
    for (const card of await levelCards(page).all()) {
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const preview = (await page.getByRole('region', { name: 'Предпросмотр', exact: true }).boundingBox())!, last = (await levelCards(page).last().boundingBox())!;
    expect(preview.y).toBeGreaterThanOrEqual(last.y + last.height);
  });
}

for (const width of [375, 1280]) {
  test(`the scale editor page has no blocking axe violations at ${width}px`, async ({ page }) => {
    await openNewScale(page, width);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
  });
}

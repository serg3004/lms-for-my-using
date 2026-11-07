import { expect, test, type Page } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

// PR 434: the admin page has one vertical scrollbar. On a wide screen the content area scrolls and the page itself does not
// (the 1px `.ui-visually-hidden` helpers of the fields used to leak into the document and add a second bar); on a phone the
// document is the only thing that scrolls.
const verticalScrollers = (page: Page) => page.evaluate(() => {
  const found: string[] = [];
  if (document.documentElement.scrollHeight > window.innerHeight + 1) found.push('document');
  for (const el of Array.from(document.querySelectorAll('main, aside, nav, section, div'))) {
    const style = getComputedStyle(el);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1 && el.getBoundingClientRect().width > 0) found.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`);
  }
  return found;
});

test('1280 px: the content area scrolls alone, the page and the sidebar stay put', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFormattingEditor(page);
  expect(await verticalScrollers(page)).toEqual(['main.admin-shell']);
  const sidebar = page.getByRole('complementary', { name: 'Админ' });
  const before = await sidebar.boundingBox();
  await page.locator('main.admin-shell').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const after = await sidebar.boundingBox();
  expect(after).toEqual(before);
  expect(after!.height).toBeGreaterThanOrEqual(799);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const width of [390, 320]) {
  test(`${width} px: only the page scrolls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openFormattingEditor(page);
    expect(await verticalScrollers(page)).toEqual(['document']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

import { expect, test } from '../fixtures/isolated-test.js';

// PR 545: the quiet author line is on the login page and does not widen it on a 360 px phone.
test('login page shows the author line without horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/login');
  const note = page.locator('.authorship-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Сергей Афанасков');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

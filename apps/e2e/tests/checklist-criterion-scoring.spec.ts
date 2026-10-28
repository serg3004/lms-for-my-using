import { expect, test } from '@playwright/test';
import { openCriterionScalePage } from '../fixtures/criterion-scales.js';

for (const role of ['learner', 'instructor'] as const) {
  for (const width of [375, 1440]) {
    test(`${role} answers mixed criterion scales and counts a zero-point answer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { writes } = await openCriterionScalePage(page, role);
      const no = page.getByRole('button', { name: /\bNo\b/ });
      await no.click();
      await expect(no).toHaveAttribute('aria-pressed', 'true');
      expect(writes.at(-1)).toEqual({ itemId: 'quality', body: { scaleLevel: 1 } });
      if (role === 'instructor') {
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
        await page.getByLabel('Комментарий', { exact: true }).fill('A zero score is still an answer');
        await page.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
        await expect(no).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: 'Далее', exact: true }).click();
      } else await expect(page.getByText('1 / 2 обязательных', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /\bSafe\b/ }).click();
      await expect(page.getByRole('button', { name: /\bSafe\b/ })).toHaveAttribute('aria-pressed', 'true');
      expect(writes.at(-1)).toEqual({ itemId: 'safety', body: { scaleLevel: 9 } });
      if (role === 'instructor') {
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
        await page.getByRole('button', { name: 'Далее', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled();
      } else await expect(page.getByText('2 / 2 обязательных', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
}

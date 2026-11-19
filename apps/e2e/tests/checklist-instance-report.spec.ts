import { expect, test } from '@playwright/test';
import { freshReportState as fresh, installReportMocks as mock } from '../fixtures/checklist-instance-report.js';

// PR 478: the filled-in sheet as a report; and answering a criterion must not reload the page.
for (const width of [390, 1280]) {
  test.describe(`filled-in sheet as a report at ${width}px (PR 478)`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height: 844 }); });

    test('opens from "Предпросмотр" with the answers and no points before completion, then goes back', async ({ page }) => {
      await mock(page, fresh());
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Приёмка товара' })).toBeVisible();
      await expect(page.getByText('Пломба цела')).toBeVisible();
      await expect(page.getByText('Проверка ещё не завершена: баллы и итог появятся после завершения.')).toBeVisible();
      await expect(page.getByText('Наблюдатель')).toHaveCount(0);
      await expect(page.getByText('Итоговый результат')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'История передач' })).toContainText('Петров Борис → Лернер Лена');
      for (const name of ['Печать', 'Скачать PDF', '← Назад к проверке']) expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole('button', { name: '← Назад к проверке' }).click();
      await expect(page.getByRole('button', { name: 'Предпросмотр', exact: true })).toBeVisible();
    });

    test('shows the result after completion and downloads the PDF', async ({ page }) => {
      const state = fresh('completed');
      await mock(page, state);
      await page.goto('/learn/checklists#completed');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
      await expect(page.getByText('Итоговый результат')).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать PDF' }).click()]);
      expect(download.suggestedFilename()).toBe('checklist-inst1.pdf');
      expect(state.pdfDownloads).toBe(1);
    });

    test('prints the report', async ({ page }) => {
      await mock(page, fresh());
      await page.addInitScript(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed += 1; }; });
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
      await page.getByRole('button', { name: 'Печать' }).click();
      expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    });
  });

  test.describe(`answering a criterion at ${width}px (PR 478)`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height: 844 }); });

    test('does not blink, reload or jump to the start of the sheet', async ({ page }) => {
      const state = fresh();
      await mock(page, state);
      await page.addInitScript(() => {
        (window as unknown as { loadingSeen: number }).loadingSeen = 0;
        new MutationObserver(() => {
          if (document.body?.textContent?.includes('Загрузка чек-листов')) (window as unknown as { loadingSeen: number }).loadingSeen += 1;
        }).observe(document, { childList: true, subtree: true, characterData: true });
      });
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      const last = page.getByRole('radiogroup', { name: '30 Критерий 30', exact: true });
      await last.scrollIntoViewIfNeeded();
      const first = page.getByRole('radiogroup', { name: '1 Критерий 1', exact: true });
      await expect(first).not.toBeInViewport();
      const before = (await last.boundingBox())!.y;
      await page.evaluate(() => { (window as unknown as { loadingSeen: number }).loadingSeen = 0; }); // the first load showed it once
      await last.getByRole('radio', { name: 'Да', exact: true }).click();
      await expect.poll(() => state.submits).toBe(1);
      await expect.poll(() => state.instanceReads).toBeGreaterThan(1);
      await expect(last.getByRole('radio', { name: 'Да', exact: true })).toBeChecked();
      // The sheet stays where it was: the same criterion is on the same place of the screen and the start is still off screen.
      expect(Math.abs((await last.boundingBox())!.y - before)).toBeLessThan(40);
      await expect(first).not.toBeInViewport();
      expect(await page.evaluate(() => (window as unknown as { loadingSeen: number }).loadingSeen)).toBe(0);
    });
  });
}

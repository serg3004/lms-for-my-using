import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { openSummaryReport, summaryGolden } from '../fixtures/session-summary-export.js';

for (const [role, width] of [['admin', 1440], ['instructor', 375], ['mentor', 375]] as const) {
  test(`${role} downloads a styled summary workbook and CSV at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const data = await openSummaryReport(page, { role });
    await expect(page.getByRole('button', { name: data.labels.xlsx, exact: true })).toBeEnabled();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: data.labels.xlsx, exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    await file.saveAs(testInfo.outputPath('summary-5s.xlsx'));
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile((await file.path())!);
    const sheet = workbook.getWorksheet('Worksheet 1')!;
    for (const [address, value] of Object.entries(summaryGolden.expectedCells)) expect(sheet.getCell(address).value).toBe(value);
    expect(sheet.getCell('C9').master.address).toBe('B9');
    expect(sheet.getCell('A19').fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FFE0E0E0' } });
    expect(sheet.getCell('A20').fill).not.toMatchObject({ pattern: 'solid' });
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 9 });
    expect(sheet.getRow(20).height).toBeGreaterThanOrEqual(30);
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: data.labels.csv, exact: true }).click();
    const csv = await csvDownload;
    expect(await readFile((await csv.path())!, 'utf8')).toContain("'=Employee");
    expect(data.requests).toEqual([{ ids: data.sessionId, format: 'xlsx' }, { ids: data.sessionId, format: 'csv' }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const locale of ['en', 'kk', 'zh'] as const) {
  test(`summary download controls use ${locale}`, async ({ page }) => {
    const { labels } = await openSummaryReport(page, { locale });
    await expect(page.getByRole('button', { name: labels.xlsx, exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: labels.csv, exact: true })).toBeEnabled();
  });
}

test('summary errors are localized, retry is possible, and one in-flight download disables both actions', async ({ page }) => {
  const data = await openSummaryReport(page);
  const excel = page.getByRole('button', { name: data.labels.xlsx, exact: true });
  const csv = page.getByRole('button', { name: data.labels.csv, exact: true });
  await expect(excel).toBeEnabled();
  data.fail(400, 'session_summary.row_limit');
  await excel.click();
  await expect(page.getByRole('alert')).toContainText('Сводка слишком большая');
  await expect(excel).toBeEnabled();
  data.fail(404, 'Not found'); await excel.click();
  await expect(page.getByRole('alert')).toContainText('Сводка недоступна');
  data.fail(500, 'Server error'); await csv.click();
  await expect(page.getByRole('alert')).toContainText('Не удалось скачать сводку');
  data.fail(200, ''); data.pause(); await excel.click();
  await expect(excel).toBeDisabled(); await expect(csv).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Подготовка сводки');
  const download = page.waitForEvent('download'); data.resume(); await download;
  await expect(excel).toBeEnabled(); await expect(page.getByRole('alert')).toHaveCount(0);
  expect(data.requests).toHaveLength(4);
});

test('a hidden result cannot be exported and an unfinished session has no summary actions', async ({ page }) => {
  const data = await openSummaryReport(page, { hidden: true });
  await expect(page.getByRole('button', { name: data.labels.xlsx, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: data.labels.csv, exact: true })).toBeDisabled();
  expect(data.requests).toHaveLength(0);
  await page.unrouteAll({ behavior: 'wait' });
  await openSummaryReport(page, { status: 'scheduled' });
  await expect(page.getByRole('button', { name: data.labels.xlsx, exact: true })).toHaveCount(0);
});

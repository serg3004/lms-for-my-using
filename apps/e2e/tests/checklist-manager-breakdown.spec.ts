import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { installManagerReportMocks, reportManagerA, reportManagerB } from '../fixtures/checklist-manager-report.js';

for (const role of ['admin', 'manager'] as const) {
  for (const width of [375, 1440]) {
    test(`${role} at ${width}px filters the manager report in the URL and downloads its CSV and Excel`, async ({ page }) => {
      const requests = await installManagerReportMocks(page, role);
      await page.setViewportSize({ width, height: 812 });
      if (role === 'admin') {
        await page.goto('/admin/checklists/sessions');
        await page.getByRole('link', { name: 'Аналитика чек-листов', exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/checklists\/analytics$/);
      } else await page.goto('/manager/checklists');
      const section = page.locator('section[aria-labelledby="manager-checklists-managers"]');
      await expect(section.getByText('=Alice Manager', { exact: true })).toBeVisible();
      await expect(section.getByText('Bob Manager', { exact: true })).toBeVisible();
      await expect(section.getByText('Без руководителя', { exact: true })).toBeVisible();
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeInViewport();
      await page.getByLabel('Руководитель', { exact: true }).selectOption(reportManagerA);
      await expect(page).toHaveURL(new RegExp(`managerId=${reportManagerA}`));
      await expect(section.getByText('Bob Manager', { exact: true })).toHaveCount(0);
      await expect(section.getByText('73%', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Руководитель', { exact: true })).toHaveValue(reportManagerA);
      await expect(section.getByText('=Alice Manager', { exact: true })).toBeVisible();
      const csvPromise = page.waitForEvent('download');
      await section.getByRole('button', { name: 'Скачать CSV: По руководителям', exact: true }).click();
      const csv = await csvPromise;
      expect(await readFile((await csv.path())!, 'utf8')).toContain("\"'=Alice Manager\"");
      expect(requests.at(-1)?.searchParams.get('table')).toBe('managers');
      expect(requests.at(-1)?.searchParams.get('managerId')).toBe(reportManagerA);
      const excelPromise = page.waitForEvent('download');
      await section.getByRole('button', { name: 'Скачать Excel: По руководителям', exact: true }).click();
      const excel = await excelPromise;
      expect(excel.suggestedFilename()).toBe('checklist-managers.xlsx');
      const { Workbook } = createRequire(new URL('../../web/package.json', import.meta.url))('exceljs');
      const workbook = new Workbook();
      await workbook.xlsx.readFile((await excel.path())!);
      const sheet = workbook.getWorksheet('По руководителям');
      expect(sheet.getCell('A2').value).toBe('=Alice Manager');
      expect(sheet.getCell('B2').value).toBe(2);
      expect(sheet.getCell('C2').value).toBe(3);
      expect(sheet.getCell('D2').value).toBe(73);
      expect(requests.at(-1)?.searchParams.get('format')).toBe('xlsx');
      await page.getByLabel('Руководитель', { exact: true }).selectOption(reportManagerB);
      await expect(section.getByText('=Alice Manager', { exact: true })).toHaveCount(0);
      await expect(section.getByText('Bob Manager', { exact: true })).toBeVisible();
      await page.getByLabel('Руководитель', { exact: true }).selectOption('unassigned');
      await expect(section.getByText('Без руководителя', { exact: true })).toBeVisible();
      await expect(section.getByText('—', { exact: true })).toBeVisible();
      await expect(section).not.toContainText(/null|undefined/);
    });
  }
}

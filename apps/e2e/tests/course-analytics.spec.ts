import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { expect, test } from '@playwright/test';

import { installAnalyticsUserFieldMocks } from '../fixtures/analytics-user-fields.js';
import { courseA, forbiddenUser, installCourseAnalyticsMocks, missingCourse, userA } from '../fixtures/course-analytics.js';

const roles = [
  ['admin', '/admin/results/courses'],
  ['manager', '/manager/reports/courses'],
  ['instructor', '/instructor/courses/analytics'],
] as const;

for (const [role, base] of roles) for (const width of [390, 1280]) {
  test(`${role} opens course analytics, drills into a course and an employee at ${width}px`, async ({ page }) => {
    const requests = await installCourseAnalyticsMocks(page, role);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Аналитика курсов' })).toBeVisible();
    await expect(page.getByText('календарное', { exact: false })).toBeVisible();
    const table = page.getByRole('table', { name: 'Курсы' });
    await expect(table.getByRole('link', { name: 'Охрана труда' })).toBeVisible();
    await expect(table.getByText('6 (60%)')).toBeVisible();
    // A filter is kept in the address and reloads the data with it.
    await page.getByLabel('С', { exact: true }).fill('2026-11-01');
    await expect(page).toHaveURL(/from=2026-11-01/);
    await expect.poll(() => requests.at(-1)?.searchParams.get('from')).not.toBeNull();
    await table.getByRole('link', { name: 'Охрана труда' }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/course/${courseA}`));
    await expect(page.getByRole('heading', { name: 'Охрана труда' })).toBeVisible();
    await expect(page.getByText('Не сдал').first()).toBeVisible();
    await page.getByRole('link', { name: 'Иванова Анна' }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/user/${userA}`));
    await expect(page.getByText('Отчёт по сотруднику')).toBeVisible();
    // On a phone the secondary columns sit behind the row's details button.
    if (width < 860) await page.getByRole('button', { name: /Подробнее/ }).first().click();
    await expect(page.locator('text=Выдан >> visible=true').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('main')).not.toContainText(/null|undefined|NaN/);
  });
}

test('a reversed period shows a validation message and does not call the API', async ({ page }) => {
  const requests = await installCourseAnalyticsMocks(page, 'admin');
  await page.goto('/admin/results/courses?from=2026-11-10&to=2026-11-01');
  await expect(page.getByRole('alert')).toContainText('не может быть позже');
  expect(requests).toHaveLength(0);
});

test('a missing course says not found and an employee outside access says no access', async ({ page }) => {
  await installCourseAnalyticsMocks(page, 'admin');
  await page.goto(`/admin/results/courses/course/${missingCourse}`);
  await expect(page.getByRole('alert')).toContainText('не найден');
  await page.goto(`/admin/results/courses/user/${forbiddenUser}`);
  await expect(page.getByRole('alert')).toContainText('нет доступа');
});

test('the course table is reachable by keyboard', async ({ page }) => {
  await installCourseAnalyticsMocks(page, 'manager');
  await page.goto('/manager/reports/courses');
  const link = page.getByRole('table', { name: 'Курсы' }).getByRole('link', { name: 'Охрана труда' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/course/${courseA}`));
});

test('each view downloads Excel and CSV with the filters of the screen, a grey header and formulas kept as text', async ({ page }) => {
  const requests = await installCourseAnalyticsMocks(page, 'admin');
  const { Workbook } = createRequire(new URL('../../web/package.json', import.meta.url))('exceljs');
  const open = async (download: { path(): Promise<string | null> }, sheetName: string) => {
    const workbook = new Workbook();
    await workbook.xlsx.readFile((await download.path())!);
    return workbook.getWorksheet(sheetName);
  };

  await page.goto('/admin/results/courses?from=2026-11-01');
  const [summary] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать Excel' }).click()]);
  expect(summary.suggestedFilename()).toBe('course-analytics-courses-2026-11-19.xlsx');
  const sheet = await open(summary, 'Сводка по курсам');
  expect(sheet.getCell('A2').value).toBe('Охрана труда');
  expect(sheet.getCell('B2').value).toBe(10);
  expect(sheet.getCell('A1').fill.fgColor.argb).toBe('FFE0E0E0');
  expect(sheet.views[0].state).toBe('frozen');
  const exportRequest = requests.filter((url) => url.pathname.endsWith('/export')).at(-1)!;
  expect(exportRequest.searchParams.get('view')).toBe('courses');
  expect(exportRequest.searchParams.get('format')).toBe('xlsx');
  expect(exportRequest.searchParams.get('from')).not.toBeNull();

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать CSV' }).click()]);
  expect(await readFile((await csv.path())!, 'utf8')).toContain('"Охрана труда"');

  await page.goto(`/admin/results/courses/course/${courseA}`);
  const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать Excel' }).click()]);
  const courseSheet = await open(report, 'По курсу');
  expect(courseSheet.getCell('A2').value).toBe('=Иванова Анна');
  expect(courseSheet.getCell('D3').value).toBe('Не сдал');
  expect(requests.filter((url) => url.pathname.endsWith('/export')).at(-1)?.searchParams.get('courseId')).toBe(courseA);

  await page.goto(`/admin/results/courses/user/${userA}`);
  const [person] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать Excel' }).click()]);
  expect((await open(person, 'По пользователю')).getCell('C3').value).toBe('Тест не проходил');
  expect(requests.filter((url) => url.pathname.endsWith('/export')).at(-1)?.searchParams.get('userId')).toBe(userA);
});

for (const width of [390, 1280]) test(`user field filters reach course analytics and exports at ${width}px`, async ({ page }) => {
  const requests = await installCourseAnalyticsMocks(page, 'manager');
  await installAnalyticsUserFieldMocks(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/manager/reports/courses');
  const fields = page.getByRole('group', { name: 'Поля пользователя' });
  await fields.getByRole('combobox', { name: 'Поле', exact: true }).selectOption('work_schedule');
  await fields.getByRole('combobox', { name: 'Значение', exact: true }).selectOption('2-2');
  await fields.getByRole('button', { name: 'Применить' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('fieldFilters')).toBe('[["work_schedule","2-2"]]');
  await fields.getByRole('combobox', { name: 'Группировать по', exact: true }).selectOption('work_schedule');
  await expect.poll(() => requests.at(-1)?.searchParams.get('groupByField')).toBe('work_schedule');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
  await download;
  expect(requests.at(-1)?.searchParams.get('fieldFilters')).toBe('[["work_schedule","2-2"]]');
  expect(requests.at(-1)?.searchParams.get('groupByField')).toBe('work_schedule');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await fields.getByRole('button', { name: 'Сбросить' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.has('fieldFilters')).toBe(false);
});

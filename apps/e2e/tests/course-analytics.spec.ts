import { expect, test } from '@playwright/test';

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

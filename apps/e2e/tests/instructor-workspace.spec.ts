import type { Browser, Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const organizationId = '10000000-0000-4000-8000-000000000001';
const seededCourseId = '10000000-0000-4000-8000-000000000031';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'instructor';

// The backend's account-level login rate limit is a FIXED 60s window (see
// resilience-matrix.spec.ts for the full rationale): other E2E files log in as these same
// demo accounts too, so this file's login can be the 6th in someone else's window and get a
// 429 that leaves the login form on /login. Only waiting out the full window (60s) reliably
// clears it, so retry once after a 65s backoff instead of failing outright (same pattern as
// login-role-redirect.spec.ts).
async function loginAs(page: Page, role: DemoRole) {
  const destination = role === 'admin' ? /\/admin$/ : /\/instructor\/dashboard$/;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login');
    await page.locator('input[name="organizationId"]').fill(organization);
    await page.locator('input[name="email"]').fill(`${role}@demo.com`);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await expect(page).toHaveURL(destination, { timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(65_000);
    }
  }
}

async function deleteCourse(page: Page, courseId: string) {
  await page.evaluate(async (id) => {
    const csrfToken = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('lms_csrf_token='))
      ?.split('=')[1];
    if (!csrfToken) throw new Error('CSRF cookie is missing during course cleanup');

    const response = await fetch(`/api/v1/courses/${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': decodeURIComponent(csrfToken) },
    });
    if (!response.ok) throw new Error(`Course cleanup failed with ${response.status}`);
  }, courseId);
}

async function createForeignCourse(browser: Browser, slug: string, title: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, 'admin');
  const created = await page.evaluate(async (input) => {
    const csrfToken = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('lms_csrf_token='))
      ?.split('=')[1];
    if (!csrfToken) throw new Error('CSRF cookie is missing during course setup');

    const response = await fetch('/api/v1/courses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': decodeURIComponent(csrfToken),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Course setup failed with ${response.status}`);
    return response.json() as Promise<{ id: string }>;
  }, { organizationId, slug, title, status: 'draft' });
  return { context, page, courseId: created.id };
}

test.describe('instructor workspace', () => {
  test('shows scoped dashboard, course list, students, and correct progress', async ({ page }) => {
    // A rate-limit retry inside loginAs can wait out a 65s backoff; budget well past the
    // default 30s so that wait doesn't itself time out the test.
    test.setTimeout(90_000);
    const coursesResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/courses' && response.request().method() === 'GET');
    const progressResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/progress' && response.request().method() === 'GET');
    await loginAs(page, 'instructor');
    const coursesResponse = await coursesResponsePromise;
    const progressResponse = await progressResponsePromise;
    expect(coursesResponse.status()).toBe(200);
    expect(progressResponse.status()).toBe(200);
    const coursesPage = await coursesResponse.json() as {
      items: Array<{ status: string }>;
    };
    const progressPage = await progressResponse.json() as {
      items: Array<{ userId: string }>;
    };
    const published = coursesPage.items.filter(({ status }) => status === 'published').length;
    const drafts = coursesPage.items.length - published;
    const students = new Set(progressPage.items.map(({ userId }) => userId)).size;

    await expect(page.getByRole('heading', { name: 'Панель инструктора' })).toBeVisible();
    const statsGrid = page.locator('.admin-content-grid').first();
    await expect(statsGrid.getByText('Курсов', { exact: true }).locator('..').getByText(String(coursesPage.items.length), { exact: true })).toBeVisible();
    await expect(statsGrid.getByText('Черновики', { exact: true }).locator('..').getByText(String(drafts), { exact: true })).toBeVisible();
    await expect(statsGrid.getByText('Учеников', { exact: true }).locator('..').getByText(String(students), { exact: true })).toBeVisible();

    await page.goto('/instructor/courses');
    await expect(page.getByRole('heading', { name: 'Основы охраны труда' })).toBeVisible();
    await page.locator('article', { hasText: 'Основы охраны труда' }).getByRole('link', { name: 'Студенты' }).click();
    await expect(page).toHaveURL(new RegExp(`/instructor/courses/${seededCourseId}/students$`));
    const learnerRow = page.getByRole('row').filter({ hasText: 'learner@demo.com' });
    await expect(learnerRow).toContainText('Alex Learner');
    await expect(learnerRow.getByRole('cell').nth(3)).toHaveText('1');
    await expect(learnerRow.getByRole('cell').nth(4)).toHaveText('0');
  });

  test('validates, creates, edits, handles duplicate slugs and API errors, then cleans up', async ({ page, isolatedCourse }) => {
    // A rate-limit retry inside loginAs can wait out a 65s backoff; budget well past the
    // default 30s so that wait doesn't itself time out the test.
    test.setTimeout(90_000);
    await loginAs(page, 'instructor');
    await page.goto('/instructor/courses/new');

    await page.getByRole('button', { name: 'Создать' }).click();
    expect(await page.locator('input[name="title"]').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);

    await page.locator('input[name="title"]').fill(isolatedCourse.title);
    await page.locator('input[name="slug"]').fill(isolatedCourse.slug);
    await page.locator('textarea[name="description"]').fill('Created by an isolated browser test');
    const createResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/courses' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Создать' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as { id: string };

    try {
      await expect(page.getByRole('heading', { name: isolatedCourse.title })).toBeVisible();
      await page.locator('article', { hasText: isolatedCourse.title }).getByRole('link', { name: 'Редактировать' }).click();
      await page.locator('input[name="title"]').fill(`${isolatedCourse.title} edited`);
      await page.locator('select[name="status"]').selectOption('published');
      await page.getByRole('button', { name: 'Сохранить' }).click();
      await expect(page.getByRole('heading', { name: `${isolatedCourse.title} edited` })).toBeVisible();

      await page.goto('/instructor/courses/new');
      await page.locator('input[name="title"]').fill('Duplicate slug course');
      await page.locator('input[name="slug"]').fill(isolatedCourse.slug);
      const duplicateResponsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/v1/courses' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Создать' }).click();
      expect((await duplicateResponsePromise).status()).toBe(409);
      await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить курс. Попробуйте ещё раз.');

      await page.locator('input[name="slug"]').fill(`${isolatedCourse.slug}-api-error`);
      await page.route('**/api/v1/courses', (route) => route.fulfill({ status: 500, body: '{}' }));
      await page.getByRole('button', { name: 'Создать' }).click();
      await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить курс. Попробуйте ещё раз.');
    } finally {
      await page.unroute('**/api/v1/courses');
      await deleteCourse(page, created.id);
    }
  });

  test('hides a foreign course and denies direct UI and API access', async ({ browser, page, isolatedCourse }) => {
    // This test performs two independent logins (the foreign admin, then this instructor), each
    // of which can independently wait out a rate-limit retry's 65s backoff; budget for both.
    test.setTimeout(150_000);
    const foreign = await createForeignCourse(browser, `${isolatedCourse.slug}-foreign`, `${isolatedCourse.title} foreign`);
    try {
      await loginAs(page, 'instructor');
      await page.goto('/instructor/courses');
      await expect(page.getByText(`${isolatedCourse.title} foreign`)).toHaveCount(0);

      const apiResult = await page.evaluate(async (courseId) => {
        const response = await fetch(`/api/v1/courses/${courseId}`);
        return { body: await response.json(), status: response.status };
      }, foreign.courseId);
      expect(apiResult).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });

      await page.goto(`/instructor/courses/${foreign.courseId}/edit`);
      await expect(page.getByRole('alert')).toHaveText('Не удалось загрузить данные.');
    } finally {
      await deleteCourse(foreign.page, foreign.courseId);
      await foreign.context.close();
    }
  });
});

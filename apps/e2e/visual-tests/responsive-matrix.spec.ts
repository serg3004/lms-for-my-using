import { expect, test, type Page, type TestInfo } from '@playwright/test';

const widths = [320, 375, 768, 1024, 1280, 1440] as const;
const height = 900;

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectTouchTargets(page: Page) {
  const undersized = await page.locator('button:visible, a[role="button"]:visible').evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') ?? element.textContent?.trim(),
          height: rect.height,
          width: rect.width,
        };
      })
      .filter(({ height, width }) => height < 44 || width < 44),
  );
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

async function captureVisualBaseline(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true });
  expect(screenshot.subarray(1, 4).toString()).toBe('PNG');
  expect(screenshot.byteLength).toBeGreaterThan(1_000);
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
}

async function installAdminMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: {
      id: 'visual-admin',
      organizationId: 'visual-org',
      email: 'admin@example.invalid',
      firstName: 'Visual',
      lastName: 'Admin',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active',
      locale: 'en',
      timezone: 'UTC',
      roles: ['admin'],
    },
  }));
  await page.route('**/api/v1/users?*', (route) => route.fulfill({
    json: {
      items: [{
        id: 'visual-user', organizationId: 'visual-org', email: 'learner@example.invalid',
        firstName: 'Responsive', lastName: 'Learner', middleName: null, position: 'Designer',
        shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC',
        lastLoginAt: '2026-01-15T12:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z', memberships: [{ role: 'learner' }],
      }],
      page: 1,
      pageSize: 20,
      total: 1,
    },
  }));
}

function paginated<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, total: items.length };
}

// Mirrors apps/web/src/shared/api/types.ts -- every required field is included so a
// Playwright network mock can't silently drift from what the frontend actually expects,
// even though page.route() responses aren't type-checked against those types.
function course(overrides: { id: string; title: string; status: string; slug?: string; category?: string | null; durationMinutes?: number | null }) {
  return {
    id: overrides.id,
    organizationId: 'visual-org',
    title: overrides.title,
    slug: overrides.slug ?? overrides.id,
    description: null,
    category: overrides.category ?? null,
    durationMinutes: overrides.durationMinutes ?? null,
    status: overrides.status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function assignment(overrides: { id: string; courseId: string; courseTitle: string; userId: string | null; groupId?: string | null; status: string; dueAt: string | null }) {
  return {
    id: overrides.id,
    organizationId: 'visual-org',
    courseId: overrides.courseId,
    userId: overrides.userId,
    groupId: overrides.groupId ?? null,
    status: overrides.status,
    dueAt: overrides.dueAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    course: { title: overrides.courseTitle },
  };
}

function assessment(overrides: { id: string; courseId: string; title: string; status: string }) {
  return {
    id: overrides.id,
    organizationId: 'visual-org',
    courseId: overrides.courseId,
    lessonId: null,
    title: overrides.title,
    slug: overrides.id,
    description: null,
    status: overrides.status,
    passingScore: 80,
    maxAttempts: 3,
    timeLimitMinutes: null,
    availableAfterCourseCompletion: false,
    passMessage: null,
    failMessage: null,
    showCorrectAnswers: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function installLearnerMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: {
      id: 'visual-learner',
      organizationId: 'visual-org',
      email: 'learner@example.invalid',
      firstName: 'Visual',
      lastName: 'Learner',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active',
      locale: 'en',
      timezone: 'UTC',
      roles: ['learner'],
    },
  }));
  await page.route('**/api/v1/courses?*', (route) => route.fulfill({
    json: paginated([
      course({ id: 'course-1', title: 'Onboarding basics', status: 'published' }),
      course({ id: 'course-2', title: 'Safety at work', status: 'published' }),
      course({ id: 'course-3', title: 'Fire safety refresher', status: 'published' }),
    ]),
  }));
  await page.route('**/api/v1/assignments?*', (route) => route.fulfill({
    json: paginated([
      assignment({ id: 'assignment-1', courseId: 'course-1', courseTitle: 'Onboarding basics', userId: 'visual-learner', status: 'in_progress', dueAt: '2099-01-01T00:00:00.000Z' }),
      assignment({ id: 'assignment-2', courseId: 'course-3', courseTitle: 'Fire safety refresher', userId: 'visual-learner', status: 'not_started', dueAt: '2099-02-01T00:00:00.000Z' }),
    ]),
  }));
  await page.route('**/api/v1/assessments', (route) => route.fulfill({
    json: [assessment({ id: 'assessment-1', courseId: 'course-1', title: 'Onboarding quiz', status: 'published' })],
  }));
  await page.route('**/api/v1/certificates?*', (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/progress?*', (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/courses/*/lessons', (route) => route.fulfill({ json: [] }));
}

async function installManagerMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: {
      id: 'visual-manager',
      organizationId: 'visual-org',
      email: 'manager@example.invalid',
      firstName: 'Visual',
      lastName: 'Manager',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active',
      locale: 'en',
      timezone: 'UTC',
      roles: ['manager'],
    },
  }));
  await page.route('**/api/v1/manager/team-summary', (route) => route.fulfill({
    json: {
      membersCount: 2,
      completionRate: 62,
      dueThisWeekCount: 1,
      overdueCount: 1,
      avgTeamScore: 78,
      upcomingDeadlines: [{ courseTitle: 'Safety at work', userId: 'visual-user-1', dueAt: '2099-01-01T00:00:00.000Z' }],
      overdueAssignments: [{ assignmentId: 'assignment-1', courseTitle: 'Onboarding basics', userId: 'visual-user-1', groupId: null, groupName: null, dueAt: '2025-01-01T00:00:00.000Z' }],
      members: [
        { userId: 'visual-user-1', firstName: 'Responsive', lastName: 'One', email: 'one@example.invalid', activeCoursesCount: 2, completionPercent: 40, status: 'risk' },
        { userId: 'visual-user-2', firstName: 'Responsive', lastName: 'Two', email: 'two@example.invalid', activeCoursesCount: 1, completionPercent: 90, status: 'good' },
        { userId: 'visual-user-3', firstName: 'Responsive', lastName: 'Three', email: 'three@example.invalid', activeCoursesCount: 3, completionPercent: 65, status: 'good' },
      ],
    },
  }));
  await page.route('**/api/v1/courses?*', (route) => route.fulfill({
    json: paginated([
      course({ id: 'course-1', title: 'Onboarding basics', status: 'published' }),
      course({ id: 'course-2', title: 'Safety at work', status: 'published' }),
    ]),
  }));
}

async function installInstructorMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: {
      id: 'visual-instructor',
      organizationId: 'visual-org',
      email: 'instructor@example.invalid',
      firstName: 'Visual',
      lastName: 'Instructor',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active',
      locale: 'en',
      timezone: 'UTC',
      roles: ['instructor'],
    },
  }));
  await page.route('**/api/v1/courses?*', (route) => route.fulfill({
    json: paginated([
      course({ id: 'course-1', title: 'Onboarding basics', status: 'published' }),
      course({ id: 'course-2', title: 'Draft course', status: 'draft' }),
      course({ id: 'course-3', title: 'Safety at work', status: 'published' }),
    ]),
  }));
  await page.route('**/api/v1/progress?*', (route) => route.fulfill({ json: paginated([]) }));
}

async function installGuestMock(page: Page) {
  let refreshRequests = 0;
  const unauthorized = (path: string) => ({
    status: 401,
    json: {
      statusCode: 401,
      error: { code: 'UNAUTHORIZED', message: 'Synthetic guest session' },
      path,
      timestamp: '2026-01-15T12:00:00.000Z',
    },
  });

  await page.route('**/api/v1/auth/refresh', (route) => {
    refreshRequests += 1;
    return route.fulfill(unauthorized('/api/v1/auth/refresh'));
  });
  await page.route('**/api/v1/auth/me', (route) => route.fulfill(unauthorized('/api/v1/auth/me')));

  return () => refreshRequests;
}

for (const width of widths) {
  test.describe(`${width}px viewport`, () => {
    test.use({ viewport: { width, height } });

    test('matches the public navigation baseline without page overflow', async ({ page }, testInfo) => {
      const getRefreshRequests = await installGuestMock(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect.poll(getRefreshRequests).toBeGreaterThan(0);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await captureVisualBaseline(page, testInfo, `public-home-${width}`);
    });

    test('keeps admin navigation, table, form, and dialog responsive', async ({ page }, testInfo) => {
      await installAdminMocks(page);
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();
      await page.getByRole('button', { name: 'Создать пользователя' }).click();
      await expect(page.getByRole('heading', { name: 'Создать пользователя' })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);

      const dialogFits = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.admin-user-dialog');
        if (!dialog) return false;
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(dialogFits).toBe(true);
      await captureVisualBaseline(page, testInfo, `admin-users-${width}`);
    });

    test('keeps the learner dashboard responsive', async ({ page }, testInfo) => {
      await installLearnerMocks(page);
      await page.goto('/learn');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await captureVisualBaseline(page, testInfo, `learner-home-${width}`);
    });

    test('keeps the manager team dashboard responsive', async ({ page }, testInfo) => {
      await installManagerMocks(page);
      await page.goto('/manager/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await captureVisualBaseline(page, testInfo, `manager-dashboard-${width}`);
    });

    test('keeps the instructor dashboard responsive', async ({ page }, testInfo) => {
      await installInstructorMocks(page);
      await page.goto('/instructor/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await captureVisualBaseline(page, testInfo, `instructor-dashboard-${width}`);
    });
  });
}

test('remains usable at 200% browser zoom', async ({ page }) => {
  await page.setViewportSize({ width: 320, height });
  const getRefreshRequests = await installGuestMock(page);
  await page.goto('/');
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await expectNoPageOverflow(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(getRefreshRequests).toBeGreaterThan(0);
});

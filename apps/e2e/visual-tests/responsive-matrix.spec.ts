import { expect, test, type Page } from '@playwright/test';

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

// Real pixel-baseline regression assertion (not just an artifact upload): fails the test
// when rendered pixels drift from the committed baseline in <spec-name>-snapshots/. See
// visual-tests/README.md for the controlled baseline-update procedure.
//
// `networkidle` plus a short settle guards against capturing a screenshot before in-flight
// rendering work (e.g. a route that resolves a tick late) has finished.
async function expectVisualMatch(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

async function installAdminMocks(page: Page) {
  // The authenticated shell reconciles the cached theme in the background.
  // Keep that request inside the visual fixture so a real API (or a refused
  // proxy connection) cannot change when the dialog screenshot is captured.
  await page.route('**/api/v1/organizations/visual-org/theme', (route) => route.fulfill({
    json: {
      themeSettings: {
        colorPrimary: '#4f46e5',
        colorPrimaryHover: '#4338ca',
      },
    },
  }));
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
      // Keep the authenticated locale aligned with the Russian visual baselines and
      // the Russian labels used by the interaction assertions below.
      locale: 'ru',
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
      locale: 'ru',
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
      locale: 'ru',
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
      locale: 'ru',
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

function lesson(overrides: { id: string; courseId: string; title: string; order: number; status: string }) {
  return {
    id: overrides.id,
    organizationId: 'visual-org',
    courseId: overrides.courseId,
    title: overrides.title,
    slug: overrides.id,
    description: null,
    type: 'text',
    order: overrides.order,
    status: overrides.status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function checklistItem(overrides: { id: string; checklistId: string; order: number; text: string }) {
  return {
    id: overrides.id,
    checklistId: overrides.checklistId,
    order: overrides.order,
    text: overrides.text,
    points: 10,
    isRequired: true,
    photoRequired: false,
  };
}

async function installAdminAuthMock(page: Page) {
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
      locale: 'ru',
      timezone: 'UTC',
      roles: ['admin'],
    },
  }));
}

async function installCourseBuilderMocks(page: Page) {
  await installAdminAuthMock(page);
  await page.route('**/api/v1/courses/course-1', (route) => route.fulfill({
    json: course({ id: 'course-1', title: 'Onboarding basics', status: 'published' }),
  }));
  await page.route('**/api/v1/courses/course-1/lessons', (route) => route.fulfill({
    json: [
      lesson({ id: 'lesson-1', courseId: 'course-1', title: 'Welcome to the team', order: 1, status: 'published' }),
      lesson({ id: 'lesson-2', courseId: 'course-1', title: 'Workplace safety basics', order: 2, status: 'published' }),
      lesson({ id: 'lesson-3', courseId: 'course-1', title: 'Emergency procedures', order: 3, status: 'draft' }),
    ],
  }));
}

async function installChecklistBuilderMocks(page: Page) {
  await installAdminAuthMock(page);
  await page.route('**/api/v1/checklists', (route) => route.fulfill({
    json: [{
      id: 'checklist-1',
      organizationId: 'visual-org',
      title: 'Opening shift checklist',
      description: 'Complete before serving the first customer.',
      status: 'draft',
      scoringMode: 'sum_points',
      passThreshold: 80,
      scaleLevels: null,
      requiresReview: true,
      createdBy: 'visual-admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [
        checklistItem({ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights and equipment' }),
        checklistItem({ id: 'item-2', checklistId: 'checklist-1', order: 2, text: 'Check the temperature log' }),
        checklistItem({ id: 'item-3', checklistId: 'checklist-1', order: 3, text: 'Restock the front counter' }),
      ],
    }],
  }));
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

    test('matches the public navigation baseline without page overflow', async ({ page }) => {
      const getRefreshRequests = await installGuestMock(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect.poll(getRefreshRequests).toBeGreaterThan(0);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `public-home-${width}`);
    });

    test('keeps admin navigation, table, form, and dialog responsive', async ({ page }) => {
      await installAdminMocks(page);
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.locator('.admin-topbar .admin-btn--primary').click();
      const dialog = page.locator('dialog.admin-user-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { level: 2 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);

      const dialogFits = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.admin-user-dialog');
        if (!dialog) return false;
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(dialogFits).toBe(true);
      await expectVisualMatch(page, `admin-users-${width}`);
    });

    test('keeps the learner dashboard responsive', async ({ page }) => {
      await installLearnerMocks(page);
      await page.goto('/learn');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `learner-home-${width}`);
    });

    test('keeps the manager team dashboard responsive', async ({ page }) => {
      await installManagerMocks(page);
      await page.goto('/manager/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `manager-dashboard-${width}`);
    });

    test('keeps the instructor dashboard responsive', async ({ page }) => {
      await installInstructorMocks(page);
      await page.goto('/instructor/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-dashboard-${width}`);
    });

    test('keeps the admin course builder and its add-lesson dialog responsive', async ({ page }) => {
      await installCourseBuilderMocks(page);
      await page.goto('/admin/courses/course-1');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);

      await page.getByRole('button', { name: /Добавить урок/ }).click();
      await expect(page.getByRole('heading', { name: 'Добавить урок' })).toBeVisible();
      await expectNoPageOverflow(page);

      const dialogFits = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.admin-dialog');
        if (!dialog) return false;
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(dialogFits).toBe(true);
      await expectVisualMatch(page, `admin-course-builder-${width}`);
    });

    test('keeps the admin checklist builder responsive', async ({ page }) => {
      await installChecklistBuilderMocks(page);
      await page.goto('/admin/checklists');
      await expect(page.getByRole('heading', { name: 'Чек-листы' })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);

      await page.getByRole('button', { name: 'Редактировать' }).click();
      await expect(page.getByRole('heading', { name: 'Opening shift checklist' })).toBeVisible();
      // Assert the actual builder surface rendered -- not just the header -- so this test
      // can't silently degrade into only checking the outer page shell.
      const itemRows = page.locator('.admin-checklist-item');
      await expect(itemRows).toHaveCount(3);
      await expect(itemRows.nth(0).locator('input').first()).toHaveValue('Turn on the lights and equipment');
      await expect(itemRows.nth(1).locator('input').first()).toHaveValue('Check the temperature log');
      await expect(itemRows.nth(2).locator('input').first()).toHaveValue('Restock the front counter');
      await expect(page.getByRole('button', { name: 'Добавить пункт' })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `admin-checklist-builder-${width}`);
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

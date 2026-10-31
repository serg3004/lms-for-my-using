import { longreadFileServer } from '../fixtures/longread-files.js';
import { openTypedAssessment } from '../fixtures/assessment-typed-compat.js';
import { longreadPlaybackServer } from '../fixtures/longread-playback.js';
import { openLongreadEntrypoints } from '../fixtures/longread-entrypoints.js';
import { longreadCourseId } from '../fixtures/longread-editor.js';
import { openPreviewBuilder, openSheetPreview } from '../fixtures/checklist-preview.js';
import { longreadCompositeFixture, longreadEditorServer } from '../fixtures/longread-editor.js';
import { longreadReaderServer, openLongreadPreview } from '../fixtures/longread-reader.js';
import { sessionReportFixture } from '../fixtures/session-report.js';
import { previewSessionImportPage } from '../fixtures/session-employee-import.js';
import { openManagementEdit, openManagementList, openManagementReport, openManagementWizard } from '../fixtures/session-management.js';
import { openCriterionScalePage } from '../fixtures/criterion-scales.js';
import { installManagerReportMocks, reportManagerA } from '../fixtures/checklist-manager-report.js';
import { expect, test, type Page } from '@playwright/test';

const widths = [320, 375, 768, 1024, 1280, 1440] as const;
const height = 900;

for (const width of [375, 1440]) test(`typed assessment compatibility state is responsive at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await openTypedAssessment(page);
  await expectNoPageOverflow(page);
  await expectVisualMatch(page, `typed-assessment-compat-${width}`, false, { maxDiffPixels: 3000 });
});

for (const width of [375, 768, 1440]) test(`longread audio/video reader is responsive at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await longreadPlaybackServer().reader(page, { direction: width === 768 ? 'rtl' : 'ltr' });
  await expectNoPageOverflow(page);
  await expectVisualMatch(page, `longread-playback-reader-${width}`, false, { maxDiffPixels: 3000 });
});
for (const role of ['admin', 'instructor'] as const) for (const width of [375, 1440]) test(`${role} longread audio/video editor is responsive at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await longreadPlaybackServer().editor(page, { role });
  await expectNoPageOverflow(page);
  if (role === 'admin' && width === 1440) {
    // The desktop admin shell scrolls inside main; a page screenshot alone captures only the header.
    const blocks = page.locator('.lr-block');
    await blocks.nth(0).scrollIntoViewIfNeeded();
    await expectVisualMatch(page, `${role}-longread-playback-editor-${width}`, false, { fullPage: false, maxDiffPixels: 3000 });
    for (const [index, name] of [[1, 'video'], [2, 'embed']] as const) {
      await blocks.nth(index).scrollIntoViewIfNeeded();
      await expectVisualMatch(page, `${role}-longread-playback-editor-${name}-${width}`, false, { fullPage: false, maxDiffPixels: 3000 });
    }
  } else await expectVisualMatch(page, `${role}-longread-playback-editor-${width}`, false, { maxDiffPixels: 3000 });
});

for (const width of [375, 1440]) for (const [screen, path] of [
  ['courses', '/admin/courses'], ['course', `/admin/courses/${longreadCourseId}`], ['lessons', '/admin/lessons'],
] as const) {
  test(`longread settings in ${screen} are responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openLongreadEntrypoints(page, { enabled: true, path });
    await expect(page.getByRole('checkbox', { name: 'Лонгрид-уроки включены для организации' })).toBeChecked();
    await expectNoPageOverflow(page);
    await expectVisualMatch(page, `longread-settings-${screen}-${width}`, false, { maxDiffPixels: 3000 });
  });
}

for (const width of [375, 768, 1440]) {
  test(`longread media reader is responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await longreadFileServer().reader(page, width === 768 ? 'rtl' : 'ltr');
    await expectNoPageOverflow(page); if (width === 375) await expectTouchTargets(page);
    await expectVisualMatch(page, `longread-media-reader-${width}`, false, { maxDiffPixels: 3000 });
  });
}
for (const role of ['admin', 'instructor'] as const) for (const width of [375, 1440]) {
  test(`${role} longread media editor is responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await longreadFileServer().editor(page, { role });
    await expectNoPageOverflow(page); if (width === 375) await expectTouchTargets(page);
    await expectVisualMatch(page, `${role}-longread-media-editor-${width}`, false, { maxDiffPixels: 3000 });
  });
}


for (const width of [375, 768, 1440]) {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`longread reader ${direction} is responsive at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await longreadReaderServer({ direction }).attach(page);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `longread-reader-${direction}-${width}`, false, { maxDiffPixels: 3000 });
    });
  }
  test(`longread preview is responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { dialog, forbiddenWrites } = await openLongreadPreview(page, { chapter: 1 });
    await expectNoPageOverflow(page);
    await expectVisualMatch(page, `longread-preview-${width}`, false, { fullPage: false, maxDiffPixels: 3000 });
    expect(forbiddenWrites).toEqual([]); await expect(dialog).toBeVisible();
  });
}

for (const role of ['admin', 'instructor'] as const) {
  for (const width of [375, 1440]) {
    test(`${role} longread editor is responsive at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await longreadEditorServer().attach(page, { role });
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `${role}-longread-editor-${width}`, false, { maxDiffPixels: 3000 });
    });
  }
}

for (const width of [375, 1440]) {
  test(`admin longread composite blocks are responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await longreadEditorServer(longreadCompositeFixture()).attach(page);
    await expectNoPageOverflow(page);
    await expectVisualMatch(page, `admin-longread-composite-${width}`, false, { maxDiffPixels: 3000 });
  });
}

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
async function expectVisualMatch(page: Page, name: string, soft = false, options: { fullPage?: boolean; maxDiffPixels?: number } = {}) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const assertion = soft ? expect.soft(page) : expect(page);
  await assertion.toHaveScreenshot(`${name}.png`, { fullPage: true, ...options });
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
  await page.route('**/api/v1/learner-dashboard', (route) => route.fulfill({
    json: {
      coursesCount: 3,
      pendingAssignmentsCount: 2,
      availableAssessmentsCount: 1,
      certificatesCount: 0,
      continueLearning: [],
      upcomingDeadlines: [
        { id: 'assignment-1', courseTitle: 'Onboarding basics', dueAt: '2099-01-01T00:00:00.000Z' },
        { id: 'assignment-2', courseTitle: 'Fire safety refresher', dueAt: '2099-02-01T00:00:00.000Z' },
      ],
      recentActivity: [],
    },
  }));
}

async function installLearnerChecklistsMocks(page: Page) {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    json: {
      id: 'visual-learner', organizationId: 'visual-org', email: 'learner@example.invalid',
      firstName: 'Visual', lastName: 'Learner', middleName: null, position: null, shift: null,
      phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['learner'],
    },
  }));
  await page.route('**/api/v1/checklist-instances/mine', (route) => route.fulfill({ json: [] }));
  // PR 353: no free-access checklists unless a test installs a catalog.
  await page.route('**/api/v1/checklists/free', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/checklist-sessions?**', (route) => route.fulfill({
    json: paginated([{
      id: 'session-1', organizationId: 'visual-org', instanceId: 'instance-1', observerId: 'observer-1',
      status: 'scheduled', version: 2, scheduledAt: '2026-02-01T09:00:00.000Z', startedAt: null,
      pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
      strengths: null, developmentAreas: null, nextSteps: null,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
      learner: { id: 'visual-learner', firstName: 'Visual', lastName: 'Learner', email: 'learner@example.invalid' },
      observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
      result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: false },
    }]),
  }));
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

async function installManagerChecklistsAnalyticsMocks(page: Page) {
  await installManagerMocks(page);
  await page.route('**/api/v1/checklists', (route) => route.fulfill({
    json: [{
      id: 'checklist-1', organizationId: 'visual-org', title: 'Opening shift checklist', description: null,
      status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: true,
      createdBy: 'visual-manager', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [],
    }],
  }));
  await page.route('**/api/v1/checklists/manager-analytics*', (route) => route.fulfill({
    json: {
      summary: { totalEmployees: 3, totalSessions: 6, completedSessions: 5, averagePercentage: 78, lowCount: 1, highCount: 2, noCompletionCount: 1 },
      thresholds: { high: 90, low: 60 },
      distribution: [{ bucket: 'low', count: 1 }, { bucket: 'mid', count: 2 }, { bucket: 'high', count: 2 }],
      trend: [
        { date: '2026-02-05', averagePercentage: 65, count: 2 },
        { date: '2026-02-12', averagePercentage: 80, count: 2 },
        { date: '2026-02-19', averagePercentage: 88, count: 1 },
      ],
      employees: [
        { userId: 'visual-user-1', firstName: 'Responsive', lastName: 'One', email: 'one@example.invalid', department: 'Warehouse', departmentId: 'visual-dept-1', sessionsCount: 3, completedCount: 3, averagePercentage: 88, trend: 'up', lastSessionAt: '2026-02-19T00:00:00.000Z' },
        { userId: 'visual-user-2', firstName: 'Responsive', lastName: 'Two', email: 'two@example.invalid', department: 'Warehouse', departmentId: 'visual-dept-1', sessionsCount: 2, completedCount: 2, averagePercentage: 55, trend: 'down', lastSessionAt: '2026-02-12T00:00:00.000Z' },
        { userId: 'visual-user-3', firstName: 'Responsive', lastName: 'Three', email: 'three@example.invalid', department: null, departmentId: null, sessionsCount: 0, completedCount: 0, averagePercentage: null, trend: null, lastSessionAt: null },
      ],
      departments: [{ departmentId: 'visual-dept-1', name: 'Warehouse', employeesCount: 2, sessionsCount: 5, completedCount: 5, averagePercentage: 74, noCompletionCount: 0 }],
      departmentOptions: [{ id: 'visual-dept-1', name: 'Warehouse' }],
      managers: [
        { managerId: 'visual-manager-a', name: 'Primary direct manager', employeesCount: 2, completedCount: 5, averagePercentage: 74 },
        { managerId: 'visual-manager-b', name: 'Primary functional manager', employeesCount: 2, completedCount: 5, averagePercentage: 74 },
        { managerId: null, name: null, employeesCount: 1, completedCount: 0, averagePercentage: null },
      ],
      managerOptions: [{ id: 'visual-manager-a', name: 'Primary direct manager' }, { id: 'visual-manager-b', name: 'Primary functional manager' }],
    },
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

function checklistItem(overrides: { id: string; checklistId: string; order: number; text: string; groupId?: string | null; isRequired?: boolean }) {
  return {
    points: 10,
    isRequired: true,
    photoRequired: false,
    ...overrides,
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
  await page.route('**/api/v1/organizations/visual-org/features', (route) => route.fulfill({ json: { longreadEnabled: false } }));
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
  // PR 296 observation-sheet builder: fetched on mount, empty is a valid/expected state here.
  await page.route('**/api/v1/checklists/checklist-1/groups', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/checklist-scales', (route) => route.fulfill({ json: [] }));
}

async function installChecklistSessionsMocks(page: Page) {
  await installAdminAuthMock(page);
  await page.route('**/api/v1/checklist-sessions/participants**', (route) => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get('role');
    const items = role === 'observer'
      ? [{ id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid', position: 'Shift lead' }]
      : [{ id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid', position: 'Barista' }];
    return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
  });
  await page.route('**/api/v1/checklists?status=published', (route) => route.fulfill({
    json: [{
      id: 'checklist-1',
      organizationId: 'visual-org',
      title: 'Opening shift checklist',
      description: 'Complete before serving the first customer.',
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 80,
      scaleLevels: null,
      requiresReview: true,
      createdBy: 'visual-admin',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      items: [checklistItem({ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights and equipment' })],
    }],
  }));
  await page.route('**/api/v1/checklist-sessions{,/to-conduct}?**', (route) => route.fulfill({
    json: {
      items: [{
        id: 'session-1',
        organizationId: 'visual-org',
        instanceId: 'instance-1',
        observerId: 'observer-1',
        status: 'scheduled',
        version: 1,
        scheduledAt: '2026-02-01T09:00:00.000Z',
        startedAt: null,
        pausedAt: null,
        locationCapturePolicy: 'off',
        timezone: 'UTC',
        overdue: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
        learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
        observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
        result: { instanceStatus: 'assigned', percentage: 0, passed: false, scored: false, visible: true },
      }],
      page: 1,
      pageSize: 20,
      total: 1,
    },
  }));
}

async function installChecklistSessionReportMocks(page: Page) {
  await installAdminAuthMock(page);
  const session = {
    id: 'session-1', organizationId: 'visual-org', instanceId: 'instance-1', observerId: 'observer-1',
    status: 'completed', version: 3, scheduledAt: '2026-02-01T09:00:00.000Z', startedAt: '2026-02-01T09:05:00.000Z',
    pausedAt: null, locationCapturePolicy: 'required', timezone: 'UTC', overdue: false,
    strengths: 'Great attention to detail', developmentAreas: null, nextSteps: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T09:05:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'completed', percentage: 92, passed: true, scored: true, visible: true },
  };
  await page.route('**/api/v1/checklist-sessions/session-1{,/conduct}', (route) => route.fulfill({ json: session }));
  await page.route('**/api/v1/checklist-sessions/session-1/report', (route) => route.fulfill({ json: sessionReportFixture(session) }));
  await page.route('**/api/v1/checklist-sessions/session-1/events', (route) => route.fulfill({
    json: [
      { id: 'event-1', organizationId: 'visual-org', sessionId: 'session-1', eventType: 'created', actorUserId: 'observer-1', metadata: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'event-2', organizationId: 'visual-org', sessionId: 'session-1', eventType: 'completed', actorUserId: 'observer-1', metadata: null, createdAt: '2026-02-01T09:30:00.000Z' },
    ],
  }));
  await page.route('**/api/v1/checklist-sessions/session-1/score-revisions', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/checklist-sessions/session-1/location', (route) => route.fulfill({
    json: [{ id: 'capture-1', organizationId: 'visual-org', sessionId: 'session-1', capturePoint: 'start', status: 'captured', capturedBy: 'observer-1', capturedAt: '2026-02-01T09:05:00.000Z' }],
  }));
  await page.route('**/api/v1/checklist-instances/instance-1', (route) => route.fulfill({
    json: {
      id: 'instance-1', organizationId: 'visual-org', checklistId: 'checklist-1', userId: 'learner-1',
      assignedBy: 'observer-1', reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null,
      status: 'completed', totalScore: 10, maxScore: 10, percentage: 92, passed: true,
      dueAt: null, submittedAt: '2026-02-01T09:25:00.000Z', completedAt: '2026-02-01T09:30:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T09:30:00.000Z',
      checklist: {
        id: 'checklist-1', organizationId: 'visual-org', title: 'Opening shift checklist', description: null,
        status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
        createdBy: 'visual-admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        items: [checklistItem({ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights and equipment' })],
      },
      results: [{ id: 'result-1', itemId: 'item-1', checked: true, scaleLevel: null, points: 10, photoUrl: null, photoFileName: null, comment: 'Done well', reviewStatus: 'approved', reviewComment: null, reviewedBy: null, reviewedAt: null }],
    },
  }));
}

async function installInstructorConductMocks(page: Page, overviewFixture = false, observerRole: 'instructor' | 'learner' | 'manager' = 'instructor') {
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
      roles: [observerRole],
    },
  }));
  await page.route('**/api/v1/checklist-instances/review-queue**', (route) => route.fulfill({ json: paginated([]) }));
  await page.route('**/api/v1/checklists/analytics**', (route) => route.fulfill({
    json: {
      assignmentsTotal: 0, counts: { assigned: 0, in_progress: 0, submitted: 0, completed: 0, expired: 0 },
      completionRate: 0, passRate: 0, averagePercentage: 0, expiredRate: 0, pendingReview: 0,
      averageCompletionTimeMs: 0, averageReviewTimeMs: 0,
    },
  }));
  const instructorSession = {
    id: 'session-1',
    organizationId: 'visual-org',
    instanceId: 'instance-1',
    observerId: 'visual-instructor',
    status: 'in_progress',
    version: 2,
    scheduledAt: '2026-02-01T09:00:00.000Z',
    startedAt: '2026-02-01T09:05:00.000Z',
    pausedAt: null,
    locationCapturePolicy: 'off',
    timezone: 'UTC',
    overdue: false,
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T09:05:00.000Z',
    checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
    learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
    observer: { id: 'visual-instructor', firstName: 'Visual', lastName: 'Instructor', email: 'instructor@example.invalid' },
    result: { instanceStatus: 'in_progress', percentage: 0, passed: false, scored: false, visible: true },
  };
  await page.route('**/api/v1/checklist-sessions{,/to-conduct}?**', (route) => route.fulfill({ json: paginated([instructorSession]) }));
  // Distinct from the list route above (no query string) -- fetched by ChecklistSessionConduct
  // when the observer opens a session from the "Conduct" tab.
  await page.route('**/api/v1/checklist-sessions/session-1{,/conduct}', (route) => route.fulfill({ json: instructorSession }));
  await page.route('**/api/v1/checklist-instances/instance-1', (route) => route.fulfill({
    json: {
      id: 'instance-1',
      organizationId: 'visual-org',
      checklistId: 'checklist-1',
      userId: 'learner-1',
      assignedBy: 'visual-instructor',
      reviewerId: null,
      reviewAssignedAt: null,
      reviewAssignedBy: null,
      status: 'in_progress',
      totalScore: 0,
      maxScore: 10,
      percentage: 0,
      passed: false,
      dueAt: null,
      submittedAt: null,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T09:05:00.000Z',
      checklist: {
        id: 'checklist-1',
        organizationId: 'visual-org',
        title: 'Opening shift checklist',
        description: 'Complete before serving the first customer.',
        status: 'published',
        scoringMode: 'sum_points',
        passThreshold: 80,
        scaleLevels: null,
        requiresReview: true,
        createdBy: 'visual-admin',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        itemGroups: overviewFixture ? [{ id: 'group-1', checklistId: 'checklist-1', title: 'Opening the workplace', order: 0 }] : [],
        items: [
          checklistItem({ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights and equipment', groupId: overviewFixture ? 'group-1' : null }),
          ...(overviewFixture ? [
            checklistItem({ id: 'item-2', checklistId: 'checklist-1', order: 2, text: 'Greet the first customer', groupId: 'group-1', isRequired: false }),
            checklistItem({ id: 'item-3', checklistId: 'checklist-1', order: 3, text: 'Inspect the spare equipment', isRequired: false }),
          ] : []),
        ],
      },
      results: overviewFixture ? [
        { id: 'result-2', itemId: 'item-2', checked: false, scaleLevel: null, points: 0, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'answered' },
        { id: 'result-3', itemId: 'item-3', checked: false, scaleLevel: null, points: 0, photoUrl: null, photoFileName: null, comment: null, reviewStatus: 'pending', reviewComment: null, reviewedBy: null, reviewedAt: null, answerState: 'skipped' },
      ] : [],
    },
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
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/v1/checklist-sessions/to-conduct?**', (route) => route.fulfill({ json: paginated([]) }));
    });

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

    test('keeps the learner training sessions section responsive', async ({ page }) => {
      await installLearnerChecklistsMocks(page);
      await page.goto('/learn/checklists');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Opening shift checklist')).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `learner-checklist-sessions-${width}`);
    });

    test('keeps the learner free checklists catalog responsive', async ({ page }) => {
      await installLearnerChecklistsMocks(page);
      await page.route('**/api/v1/checklists/free', (route) => route.fulfill({
        json: [
          { id: 'free-1', title: 'Opening shift checklist', description: 'Complete before serving the first customer.', itemCount: 12, pinned: false, activeInstanceId: null, activeInstanceStatus: null },
          { id: 'free-2', title: 'Closing shift checklist with a deliberately long title that has to wrap on a phone', description: null, itemCount: 7, pinned: false, activeInstanceId: 'instance-2', activeInstanceStatus: 'in_progress' },
        ],
      }));
      await page.goto('/learn/checklists');
      await expect(page.getByRole('heading', { name: /All my checklists|Все мои листы/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^(Start|Начать)$/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^(Continue|Продолжить)$/ })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `learner-free-checklists-${width}`);
    });

    test('keeps the learner pinned checklist tiles responsive', async ({ page }) => {
      await installLearnerChecklistsMocks(page);
      await page.route('**/api/v1/checklists/free', (route) => route.fulfill({
        json: [
          { id: 'free-1', title: 'Opening shift checklist', description: null, itemCount: 12, pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z', activeInstanceId: null, activeInstanceStatus: null },
          { id: 'free-2', title: 'Closing shift checklist with a deliberately long title that has to wrap on a phone', description: null, itemCount: 7, pinned: true, activeInstanceId: 'instance-2', activeInstanceStatus: 'in_progress' },
          { id: 'free-3', title: 'Cash desk audit', description: 'Not pinned, stays in the big block.', itemCount: 5, pinned: false, activeInstanceId: null, activeInstanceStatus: null },
        ],
      }));
      // PR 355: one tile has a picture (a deterministic inline SVG), the other falls back to the default illustration.
      const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#bfdbfe"/><circle cx="160" cy="90" r="40" fill="#2563eb"/></svg>')}`;
      await page.route('**/api/v1/checklists/free-1/cover', (route) => route.fulfill({ json: { url: cover, expiresIn: 300 } }));
      await page.goto('/learn/checklists');
      await expect(page.getByRole('heading', { name: /Pinned checklists|Закреплённые листы/ })).toBeVisible();
      // The picture is shown on the tile and again on the row of the same checklist in the big block.
      await expect(page.locator('img[alt*="Opening shift checklist"]')).toHaveCount(2);
      await expect.poll(() => page.locator('img[alt*="Opening shift checklist"]').evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await expect(page.getByRole('heading', { name: /All my checklists|Все мои листы/ })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `learner-pinned-checklists-${width}`);
    });

    test('keeps the manager team dashboard responsive', async ({ page }) => {
      await installManagerMocks(page);
      await page.goto('/manager/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `manager-dashboard-${width}`);
    });

    test('keeps the manager checklist analytics dashboard responsive', async ({ page }) => {
      await installManagerChecklistsAnalyticsMocks(page);
      await page.goto('/manager/checklists');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Responsive One')).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `manager-checklist-analytics-${width}`);
    });

    for (const role of ['admin', 'manager'] as const) {
      test(`keeps the ${role} manager breakdown responsive`, async ({ page }) => {
        await installManagerReportMocks(page, role);
        if (role === 'admin') {
          await page.goto('/admin/checklists/sessions');
          await page.getByRole('link', { name: 'Аналитика чек-листов', exact: true }).click();
        } else await page.goto('/manager/checklists');
        const section = page.locator('section[aria-labelledby="manager-checklists-managers"]');
        await expect(section.getByText('=Alice Manager', { exact: true })).toBeVisible();
        if (role === 'manager') {
          await page.getByLabel('Руководитель', { exact: true }).selectOption(reportManagerA);
          await expect(section.getByText('Bob Manager', { exact: true })).toHaveCount(0);
        }
        await expectNoPageOverflow(page);
        if (width <= 375) await expectTouchTargets(page);
        if (role === 'admin' && width > 860) {
          // The desktop admin shell scrolls internally: a full-page screenshot only
          // paints its first viewport. Capture the report after actually reaching it.
          await section.scrollIntoViewIfNeeded();
          await expect(section).toBeInViewport();
          await page.waitForLoadState('networkidle');
          await expect(section).toHaveScreenshot(`${role}-checklist-manager-report-${width}.png`);
        } else await expectVisualMatch(page, `${role}-checklist-manager-report-${width}`);
      });
    }

    for (const role of ['learner', 'instructor'] as const) {
      test(`keeps ${role} criterion-scale answers responsive`, async ({ page }) => {
        await openCriterionScalePage(page, role);
        await page.getByRole('button', { name: /\bNo\b/ }).click();
        await expect(page.getByRole('button', { name: /\bNo\b/ })).toHaveAttribute('aria-pressed', 'true');
        await expectNoPageOverflow(page);
        if (width <= 375) await expectTouchTargets(page);
        await expectVisualMatch(page, `${role}-criterion-scale-answer-${width}`);
      });
    }

    for (const role of ['admin', 'instructor'] as const) {
      test(`keeps the ${role} session employee import preview responsive`, async ({ page }) => {
        await previewSessionImportPage(page, role);
        await expectNoPageOverflow(page);
        if (width <= 375) await expectTouchTargets(page);
        await expectVisualMatch(page, `${role}-session-employee-import-${width}`);
      });
    }

    test.describe('session management role shells (PR 360б)', () => {
      test.use({ timezoneId: 'UTC' });
      for (const role of ['instructor', 'mentor'] as const) {
        test(`keeps the ${role} management list, dialogs and report responsive`, async ({ page }) => {
          test.setTimeout(60_000);
          await openManagementList(page, role);
          await expectNoPageOverflow(page);
          if (width <= 375) await expectTouchTargets(page);
          await expectVisualMatch(page, `${role}-management-sessions-list-${width}`, true);

          const edit = await openManagementEdit(page);
          await expectNoPageOverflow(page);
          if (width <= 375) await expectTouchTargets(page);
          await expectVisualMatch(page, `${role}-management-session-edit-${width}`, true);
          await page.keyboard.press('Escape');
          await expect(edit).not.toBeVisible();

          const wizard = await openManagementWizard(page);
          await expectNoPageOverflow(page);
          if (width <= 375) await expectTouchTargets(page);
          await expectVisualMatch(page, `${role}-management-session-create-${width}`, true);
          await page.keyboard.press('Escape');
          await expect(wizard).not.toBeVisible();

          await openManagementReport(page, role);
          await expectNoPageOverflow(page);
          if (width <= 375) await expectTouchTargets(page);
          await expect(page.getByRole('button', { name: 'Скачать сводку (Excel)', exact: true })).toBeEnabled();
          await expectVisualMatch(page, `${role}-management-session-report-${width}`, true, { maxDiffPixels: 3000 });
        });
      }
    });

    test('keeps the instructor dashboard responsive', async ({ page }) => {
      await installInstructorMocks(page);
      await page.goto('/instructor/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-dashboard-${width}`);
    });

    test('keeps the instructor mobile observer conduct screen responsive', async ({ page }) => {
      await installInstructorConductMocks(page, true);
      await page.clock.setFixedTime(new Date('2026-02-01T09:10:00.000Z'));
      await page.goto('/instructor/checklists/sessions');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Opening shift checklist').first()).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-checklist-sessions-list-${width}`);

      await page.getByRole('button', { name: /Leo Learner/ }).click();
      await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-checklist-session-conduct-${width}`);
      if (width <= 768) {
        await page.getByRole('button', { name: 'Обзор листа', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Обзор листа', exact: true })).toContainText('Обработано 2 из 3');
        await expectNoPageOverflow(page);
        if (width <= 375) await expectTouchTargets(page);
        await expectVisualMatch(page, `instructor-checklist-session-overview-${width}`);
      }
    });

    for (const role of ['learner', 'manager'] as const) {
      test(`keeps the ${role} assigned-observer block and conduct screen responsive`, async ({ page }) => {
        if (role === 'learner') await installLearnerMocks(page);
        else await installManagerMocks(page);
        await installInstructorConductMocks(page, false, role);
        await page.route('**/api/v1/checklists/free', (route) => route.fulfill({ json: [] }));
        await page.route('**/api/v1/checklist-instances/mine', (route) => route.fulfill({ json: [] }));
        await page.route('**/api/v1/checklist-sessions?**', (route) => route.fulfill({ json: paginated([]) }));
        await page.clock.setFixedTime(new Date('2026-02-01T09:10:00.000Z'));
        await page.goto(role === 'learner' ? '/learn/checklists' : '/manager/team');
        const block = page.getByRole('region', { name: 'Сессии к проведению' });
        await expect(block.getByText('Opening shift checklist')).toBeVisible();
        await expectNoPageOverflow(page);
        await page.waitForLoadState('networkidle');
        await expect.soft(page).toHaveScreenshot(`${role}-observer-block-${width}.png`, { fullPage: true });
        await block.getByRole('button', { name: /Leo Learner/ }).click();
        await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Новая сессия', exact: true })).toHaveCount(0);
        await expectNoPageOverflow(page);
        if (width <= 375) await expectTouchTargets(page);
        await page.waitForLoadState('networkidle');
        await expect.soft(page).toHaveScreenshot(`${role}-observer-conduct-${width}.png`, { fullPage: true });
        // The learner shell has a fixed mobile nav: actions must remain clickable after scrolling.
        await page.getByRole('button', { name: 'Далее', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Структурированная обратная связь', exact: true })).toBeVisible();
      });
    }

    test('keeps the observer pre-start screen with past sessions responsive', async ({ page }) => {
      await installInstructorConductMocks(page);
      const scheduledSession: Record<string, unknown> = {
        id: 'session-2', organizationId: 'visual-org', instanceId: 'instance-1', observerId: 'visual-instructor', status: 'scheduled', version: 1,
        scheduledAt: '2026-02-10T09:00:00.000Z', durationMinutes: null, startedAt: null, pausedAt: null, locationCapturePolicy: 'off', timezone: 'UTC', overdue: false,
        strengths: null, developmentAreas: null, nextSteps: null, observerUnavailableReason: null, observerUnavailableAt: null,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        checklist: { id: 'checklist-1', title: 'Opening shift checklist' },
        learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
        observer: { id: 'visual-instructor', firstName: 'Visual', lastName: 'Instructor', email: 'instructor@example.invalid' },
        result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
      };
      const pastSession: Record<string, unknown> = {
        ...scheduledSession, id: 'session-0', status: 'completed', version: 4, scheduledAt: '2026-01-10T09:00:00.000Z', startedAt: '2026-01-10T09:05:00.000Z',
        strengths: 'Чётко проводит передачу смены', developmentAreas: 'Скорость работы на кассе',
        result: { instanceStatus: 'completed', percentage: 85, passed: true, scored: true, visible: true },
      };
      await page.route('**/api/v1/checklist-sessions/session-2{,/conduct}', (route) => route.fulfill({ json: scheduledSession }));
      await page.route('**/api/v1/checklist-sessions{,/to-conduct}?**', (route) => route.fulfill({
        json: paginated(route.request().url().includes('status=completed') ? [pastSession] : [scheduledSession]),
      }));
      await page.goto('/instructor/checklists/sessions/session-2');
      await expect(page.getByRole('heading', { name: 'Прошлые сессии' })).toBeVisible();
      await expect(page.getByText('Скорость работы на кассе')).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-checklist-session-prestart-${width}`);
    });

    test('keeps the observer creation wizard responsive with the caller fixed', async ({ page }) => {
      await installInstructorConductMocks(page);
      await page.route('**/api/v1/checklist-sessions/participants**', (route) => route.fulfill({
        json: paginated([{ id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid', position: null }]),
      }));
      await page.goto('/instructor/checklists/sessions');
      await page.getByRole('button', { name: 'Новая сессия', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: /^Leo Learner/ })).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText('Эту сессию проведёте вы.');
      await expect(page.getByRole('button', { name: 'Сменить наблюдателя' })).toHaveCount(0);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `instructor-checklist-sessions-wizard-${width}`);
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

    test('keeps the observer sheet preview responsive', async ({ page }) => {
      await openPreviewBuilder(page);
      const dialog = await openSheetPreview(page);
      await expectNoPageOverflow(page);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await dialog.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })).toEqual({ x: 0, y: 0, width, height });
      // Capture the actual viewport: fullPage temporarily enlarges the viewport to
      // the inert builder's height and changes a fixed dialog's dimensions. The
      // new captures use a 3000-pixel budget so scrolling to another block cannot
      // pass against a duplicate header baseline under the legacy 30000 budget.
      await expectVisualMatch(page, `checklist-preview-header-${width}`, true, { fullPage: false, maxDiffPixels: 3000 });
      await dialog.getByRole('radiogroup').first().evaluate((node) => node.parentElement?.scrollIntoView({ block: 'start' }));
      expect(await dialog.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await expectVisualMatch(page, `checklist-preview-criteria-${width}`, true, { fullPage: false, maxDiffPixels: 3000 });
      await dialog.getByRole('button', { name: 'Сбросить', exact: true }).scrollIntoViewIfNeeded();
      await expectVisualMatch(page, `checklist-preview-feedback-${width}`, true, { fullPage: false, maxDiffPixels: 3000 });
    });

    test('keeps the admin checklist builder responsive', async ({ page }) => {
      await installChecklistBuilderMocks(page);
      await page.goto('/admin/checklists');
      await expect(page.getByRole('heading', { name: 'Чек-листы' })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      // Baseline for the plain list view (PR 294 UI foundation) -- previously only the builder
      // (edit-mode) surface below had a baseline, so PR 295+'s new sessions tab/screens next to
      // this list had nothing to diff their shared shell/header/table against.
      await expectVisualMatch(page, `admin-checklists-list-${width}`);

      // UI refresh PR 311: at <=860px row actions live in the row's responsive details.
      if (width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
      await page.getByRole('button', { name: 'Редактировать' }).click();
      await expect(page.getByRole('heading', { name: 'Opening shift checklist' })).toBeVisible();
      // Assert the actual builder surface rendered -- not just the header -- so this test
      // can't silently degrade into only checking the outer page shell. PR 317 replaced the old
      // flex `.admin-checklist-item` rows with a `.admin-criteria-row` table (excluding its own
      // header row, which shares the base class).
      const itemRows = page.locator('.admin-criteria-row:not(.admin-criteria-row--head)');
      await expect(itemRows).toHaveCount(3);
      await expect(itemRows.nth(0).locator('.admin-criteria-row__text')).toHaveValue('Turn on the lights and equipment');
      await expect(itemRows.nth(1).locator('.admin-criteria-row__text')).toHaveValue('Check the temperature log');
      await expect(itemRows.nth(2).locator('.admin-criteria-row__text')).toHaveValue('Restock the front counter');
      await expect(page.getByRole('button', { name: /Критерий/ }).first()).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `admin-checklist-builder-${width}`);
    });

    test('keeps the evaluation scale editor responsive', async ({ page }) => {
      await installChecklistBuilderMocks(page);
      await page.goto('/admin/checklists');
      await expect(page.getByRole('heading', { name: 'Чек-листы' })).toBeVisible();
      if (width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
      await page.getByRole('button', { name: 'Редактировать' }).click();
      await page.getByRole('button', { name: 'Оценочные шкалы' }).click();
      await page.getByRole('button', { name: 'Новая шкала' }).click();
      const dialog = page.getByRole('dialog', { name: 'Новая шкала' });
      await expect(dialog.getByLabel('Название уровня 2')).toBeVisible();
      const dialogFits = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(dialogFits).toBe(true);
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `admin-checklist-scale-editor-${width}`);
    });

    test('keeps the admin checklist sessions list and wizard responsive', async ({ page }) => {
      await installChecklistSessionsMocks(page);
      // PR 360в: this admin is not an observer here, so the queue block stays hidden and the baseline is unchanged.
      await page.route('**/api/v1/checklist-sessions/to-conduct?**', (route) => route.fulfill({ json: paginated([]) }));
      await page.goto('/admin/checklists/sessions');
      // PR 318: the page's own <h1> now reads "Обучающие сессии" ("Training sessions") -- the
      // breadcrumb/nav-tab strip keep the shorter "Сессии" label.
      await expect(page.getByRole('heading', { name: 'Обучающие сессии' })).toBeVisible();
      await expect(page.getByText('Opening shift checklist')).toBeVisible();
      await expectNoPageOverflow(page);
      // Hidden horizontal overflow must not conceal the primary action on wide screens.
      const createButtonBounds = await page.getByRole('button', { name: /Новая сессия/ }).boundingBox();
      expect(createButtonBounds).not.toBeNull();
      expect(createButtonBounds!.x).toBeGreaterThanOrEqual(0);
      expect(createButtonBounds!.x + createButtonBounds!.width).toBeLessThanOrEqual(width);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `admin-checklist-sessions-list-${width}`);

      await page.getByRole('button', { name: /Новая сессия/ }).click();
      await expect(page.getByRole('heading', { name: 'Новая сессия' })).toBeVisible();
      await expectNoPageOverflow(page);

      const dialogFits = await page.evaluate(() => {
        const dialog = document.querySelector('dialog.ds-wizard-dialog');
        if (!dialog) return false;
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      });
      expect(dialogFits).toBe(true);
      await expectVisualMatch(page, `admin-checklist-sessions-wizard-${width}`);
    });

    test('keeps observer eligibility settings responsive', async ({ page }) => {
      await installChecklistSessionsMocks(page);
      await page.route('**/api/v1/checklist-sessions/to-conduct?**', (route) => route.fulfill({ json: paginated([]) }));
      await page.route('**/api/v1/checklists/workplace-settings', (route) => route.fulfill({ json: {
        organizationId: 'visual-org', moduleEnabled: true, highPerformanceThreshold: 90, lowThreshold: null,
        resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
        defaultGeolocationPolicy: 'off', feedbackVisibility: 'after_completion', updatedAt: null,
        observerEligibility: 'selected_roles', observerRoles: ['instructor', 'manager', 'admin'],
        observerUserIds: [], selectedObserverUsers: [],
      } }));
      await page.route('**/api/v1/users?*', (route) => route.fulfill({ json: {
        items: [{ id: 'candidate-1', firstName: 'Елена', lastName: 'Наблюдатель', email: 'observer@example.invalid', status: 'active' }],
        total: 1, page: 1, pageSize: 20,
      } }));
      await page.goto('/admin/checklists/sessions');
      await page.getByRole('button', { name: /Настройки/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Кто может быть наблюдателем')).toBeVisible();
      await expect(dialog.getByRole('group', { name: 'Разрешённые роли', exact: true }).getByRole('checkbox', { name: 'Инструктор', exact: true })).toBeChecked();
      await expectNoPageOverflow(page);
      await page.waitForLoadState('networkidle');
      await expect.soft(page).toHaveScreenshot(`admin-checklist-observer-roles-${width}.png`, { fullPage: true });
      await dialog.getByLabel('Выбор наблюдателей').selectOption('selected_users');
      const person = dialog.getByRole('checkbox', { name: 'Елена Наблюдатель (observer@example.invalid)', exact: true });
      await expect(person).toBeVisible();
      await person.scrollIntoViewIfNeeded();
      await expectNoPageOverflow(page);
      await page.waitForLoadState('networkidle');
      await expect.soft(page).toHaveScreenshot(`admin-checklist-observer-people-${width}.png`, { fullPage: true });
    });

    test('keeps the admin session report responsive', async ({ page }) => {
      await installChecklistSessionReportMocks(page);
      await page.goto('/admin/checklists/sessions/session-1');
      // The breadcrumb also renders this text but collapses on narrow viewports -- the <h1> is
      // the one guaranteed-visible occurrence at every width.
      await expect(page.getByRole('heading', { level: 1, name: 'Opening shift checklist' })).toBeVisible();
      // PR 322: the Summary tab's "Final result" KPI card shows the percentage and a
      // Passed/Not passed badge separately, not "92% ✓" inline.
      await expect(page.getByText('92%', { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expect(page.getByRole('button', { name: 'Скачать сводку (Excel)', exact: true })).toBeEnabled();
      await expectVisualMatch(page, `admin-checklist-session-report-${width}`, false, { maxDiffPixels: 3000 });
      await page.getByRole('button', { name: 'Пересчитать', exact: true }).click();
      const recalculate = page.getByRole('dialog');
      await recalculate.getByRole('combobox', { name: 'Формула', exact: true }).selectOption('criteria');
      await recalculate.getByLabel('Причина пересчёта').fill('Проверка формулы по критериям');
      await expectNoPageOverflow(page);
      if (width <= 375) await expectTouchTargets(page);
      await expectVisualMatch(page, `admin-checklist-recalculate-formula-${width}`, false, { maxDiffPixels: 3000 });
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

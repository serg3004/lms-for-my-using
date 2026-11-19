import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildCourseUserRows, summarizeCourses, summarizeUser } from './course-analytics.js';
import { courseExportRows, coursesExportRows, SHEET_NAMES, userExportRows } from './course-analytics-export.js';

/**
 * PR 476: acceptance guard for gaps 50-52 of docs/product/future/CHECKLIST_REMAINING_WORK_PLAN.md (course analytics:
 * data API PR 473, screens PR 474, export PR 475). It fails when a later change drops a role from a screen or an export,
 * widens the object scope of the manager or the instructor, loses one of the metrics of the plan from the API, the
 * export or the texts, or lets the competitor's name into the code and the texts (the owner calls it "эталон").
 * Behaviour itself is tested next to the code; this file only pins what the plan promised.
 */

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const controller = read('apps/api/src/modules/reports/reports.controller.ts');
const service = read('apps/api/src/modules/reports/course-analytics.service.ts');
const locales = ['ru', 'en', 'kk', 'zh'] as const;

describe('course analytics: roles and routes (PR 473, 475, 476)', () => {
  it.each([
    ['course-analytics'],
    ['course-analytics/export'],
    ['course-analytics/courses/:courseId'],
    ['course-analytics/users/:userId'],
  ])('serves %s to administrator, manager and instructor only', (path) => {
    const at = controller.indexOf(`@Get('${path}')`);
    expect(at).toBeGreaterThan(-1);
    expect(controller.slice(at, at + 120)).toContain('@Roles(...rolePolicies.courseAnalyticsRead)');
  });

  it('has no write route: the analytics only reads and exports', () => {
    const block = controller.slice(controller.indexOf("@Get('course-analytics')"));
    expect(block).not.toMatch(/@(Post|Put|Patch|Delete)\(['"]course-analytics/);
  });
});

describe('course analytics: object scope (PR 473, 476)', () => {
  it('limits a manager to the users of their team and an instructor to the courses they teach', () => {
    expect(service).toContain('this.orgAccessScope.user(actor)');
    expect(service).toMatch(/instructors:\s*\{\s*some:\s*\{\s*instructorId:\s*actor\.id/);
    expect(service).toContain("actor.roles.includes('admin')");
  });

  it('keeps the organization filter on courses, users and assignments', () => {
    expect(service.match(/organizationId/g)?.length).toBeGreaterThanOrEqual(8);
    expect(service).toMatch(/deletedAt:\s*null/);
    expect(service).toContain("status: { not: 'cancelled' }");
  });

  it('answers 404 for a course or a user outside the scope, and the export repeats the reads of the screen', () => {
    expect(service).toContain('NotFoundException');
    expect(service).toContain('this.getCourseReport(');
    expect(service).toContain('this.getUserReport(');
    expect(service).toContain('this.getCourses(');
    expect(service).toContain("'course_report.exported'");
  });

  it('refuses an export that would be cut instead of handing out partial data', () => {
    expect(service).toMatch(/truncated\s*\|\|\s*[\w.]+\s*>\s*MAX_EXPORT_ROWS|MAX_EXPORT_ROWS/);
    expect(service).toContain('BadRequestException');
  });
});

describe('course analytics: web screens of each role (PR 474, 476)', () => {
  it.each([
    ['apps/web/src/app/routes/AdminRoutes.tsx', 'admin/results/courses/*', 'AdminCourseAnalyticsPage'],
    ['apps/web/src/app/routes/ManagerRoutes.tsx', 'reports/courses/*', 'ManagerCourseAnalyticsPage'],
    ['apps/web/src/app/routes/InstructorRoutes.tsx', 'courses/analytics/*', 'InstructorCourseAnalyticsPage'],
  ])('%s opens %s', (file, path, page) => {
    const text = read(file);
    expect(text).toContain(`path="${path.startsWith('admin/') ? '/' : ''}${path}"`);
    expect(text).toContain(`<${page} />`);
  });

  it('keeps the three paths of the screens in one place', () => {
    const pages = read('apps/web/src/app/CourseAnalyticsPages.tsx');
    expect(pages).toContain("ADMIN_COURSE_ANALYTICS_PATH = '/admin/results/courses'");
    expect(pages).toContain("MANAGER_COURSE_ANALYTICS_PATH = '/manager/reports/courses'");
    expect(pages).toContain("INSTRUCTOR_COURSE_ANALYTICS_PATH = '/instructor/courses/analytics'");
  });

  it('puts both export buttons and the calendar-time note on the screen', () => {
    const page = read('apps/web/src/app/CourseAnalyticsPage.tsx');
    expect(page).toContain('courseAnalytics.exportXlsx');
    expect(page).toContain('courseAnalytics.exportCsv');
    expect(page).toContain('courseAnalytics.timeNote');
  });
});

describe('course analytics: the metrics of the plan are counted (PR 473, 476)', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  const rows = buildCourseUserRows({
    now,
    assignments: [{ courseId: 'c1', userId: 'u1', dueAt: new Date('2026-11-01T00:00:00Z'), completed: false }],
    lessons: [{ id: 'l1', courseId: 'c1' }],
    progress: [],
    assessments: [{ id: 't1', courseId: 'c1' }],
    attempts: [],
    certificates: [],
  });

  it('gives each employee: status, lessons, test, attempts, time, due date, overdue and certificate', () => {
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'attempts', 'certificate', 'completedAt', 'courseId', 'dueAt', 'durationMinutes', 'lessonsCompleted', 'lessonsPercent', 'lessonsTotal',
      'overdue', 'startedAt', 'status', 'testPercent', 'testResult', 'testScore', 'userId',
    ]);
    expect(rows[0]).toMatchObject({ status: 'not_started', overdue: true, testResult: 'pending' });
  });

  it('gives each course: assigned, started, completed, passed, failed, overdue, average and median score, average time', () => {
    expect(Object.keys(summarizeCourses(rows)[0]!).sort()).toEqual([
      'assigned', 'avgDurationMinutes', 'avgPercent', 'completed', 'completedPercent', 'courseId', 'failed', 'medianPercent', 'overdue', 'passed', 'started',
    ]);
  });

  it('gives each employee a summary with the issued certificates', () => {
    expect(Object.keys(summarizeUser(rows)).sort()).toEqual(['assigned', 'avgPercent', 'certificates', 'completed', 'passed']);
  });

  it('says in the response that time is calendar time', () => {
    expect(service.match(/durationBasis: 'calendar' as const/g)).toHaveLength(3);
  });
});

describe('course analytics: the export carries the same metrics in every language (PR 475, 476)', () => {
  const course = { assigned: 1, started: 1, completed: 1, completedPercent: 100, passed: 1, failed: 0, overdue: 0, avgPercent: 80, medianPercent: 80, avgDurationMinutes: 60 };
  const row = {
    status: 'completed' as const, lessonsTotal: 1, lessonsCompleted: 1, lessonsPercent: 100, testPercent: 80, testScore: 8, attempts: 1, testResult: 'passed' as const,
    startedAt: null, completedAt: null, durationMinutes: 60, dueAt: null, overdue: false, certificate: null,
  };
  it.each(locales)('keeps the column counts of the three tables in %s', (locale) => {
    expect(coursesExportRows([{ ...course, title: 'A' }], locale)[0]).toHaveLength(11);
    expect(courseExportRows([{ ...row, user: { firstName: 'A', lastName: 'B', email: 'a@x.kz' } }], locale, 'UTC')[0]).toHaveLength(16);
    expect(userExportRows([{ ...row, courseTitle: 'A' }], locale, 'UTC')[0]).toHaveLength(15);
    for (const view of ['courses', 'course', 'user'] as const) expect(SHEET_NAMES[view][locale].length).toBeGreaterThan(0);
  });
  it.each(locales)('closes every table with the note about calendar time in %s', (locale) => {
    for (const table of [
      coursesExportRows([{ ...course, title: 'A' }], locale),
      courseExportRows([{ ...row, user: null }], locale, 'UTC'),
      userExportRows([{ ...row, courseTitle: 'A' }], locale, 'UTC'),
    ]) expect(String(table.at(-1)?.[0]).length).toBeGreaterThan(20);
  });
});

describe('course analytics: texts exist in all four languages (PR 474, 475, 476)', () => {
  const keys = [
    'title', 'subtitle', 'loading', 'loadError', 'notFound', 'forbidden', 'periodInvalid', 'timeNote', 'truncated', 'empty', 'emptyUser',
    'assigned', 'completed', 'passed', 'failed', 'overdue', 'avgScore', 'medianScore', 'avgTime', 'exportXlsx', 'exportCsv', 'exporting', 'exportError', 'exportTooLarge',
    'status.not_started', 'status.in_progress', 'status.completed', 'result.passed', 'result.failed', 'result.pending', 'result.no_test',
  ];
  const pick = (block: Record<string, unknown>, path: string): unknown => path.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], block);
  it.each(locales)('has every key in %s and none is empty', (locale) => {
    const block = JSON.parse(read(`apps/web/src/i18n/locales/${locale}/common.json`)).courseAnalytics as Record<string, unknown>;
    for (const key of keys) expect({ key, value: typeof pick(block, key) }).toEqual({ key, value: 'string' });
    for (const key of keys) expect((pick(block, key) as string).trim()).not.toBe('');
  });
});

describe('course analytics: no third-party product name in its code and texts (PR 476)', () => {
  const word = ['i', 'Spring'].join('').toLowerCase();
  const files = [
    ...readdirSync(join(root, 'apps/api/src/modules/reports')).map((name) => `apps/api/src/modules/reports/${name}`),
    'apps/web/src/app/CourseAnalyticsPage.tsx',
    'apps/web/src/app/CourseAnalyticsPages.tsx',
    'apps/web/src/shared/api/courseAnalytics.ts',
    'apps/e2e/fixtures/course-analytics.ts',
    'apps/e2e/tests/course-analytics.spec.ts',
    ...locales.map((locale) => `apps/web/src/i18n/locales/${locale}/common.json`),
  ];
  it('finds it in none of the files of the feature', () => {
    // The acceptance file spells the word in pieces, so it never contains it itself.
    expect(files.filter((file) => read(file).toLowerCase().includes(word))).toEqual([]);
  });
});

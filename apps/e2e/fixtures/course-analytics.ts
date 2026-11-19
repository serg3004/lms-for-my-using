import type { Page } from '@playwright/test';
import type { CourseAnalyticsList, CourseReport, UserReport } from '../../web/src/shared/api/courseAnalytics.js';

/** PR 474: mocked course analytics API (PR 473) for the e2e and visual tests of the "Course analytics" screens. */

export const courseA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
export const courseB = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
export const userA = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
export const userB = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const missing = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
export const forbiddenUser = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

const people = {
  [userA]: { id: userA, firstName: 'Анна', lastName: 'Иванова', email: 'anna@example.invalid' },
  [userB]: { id: userB, firstName: 'Олег', lastName: 'Петров', email: 'oleg@example.invalid' },
};

const summaryA = { courseId: courseA, assigned: 10, started: 8, completed: 6, completedPercent: 60, passed: 5, failed: 1, overdue: 2, avgPercent: 82, medianPercent: 80, avgDurationMinutes: 4320 };
const summaryB = { courseId: courseB, assigned: 4, started: 1, completed: 0, completedPercent: 0, passed: 0, failed: 0, overdue: 1, avgPercent: null, medianPercent: null, avgDurationMinutes: null };

export const listFixture: CourseAnalyticsList = {
  period: { from: null, to: null }, durationBasis: 'calendar', truncated: false,
  courses: [{ ...summaryA, title: 'Охрана труда' }, { ...summaryB, title: 'Складская приёмка' }],
  filterOptions: { departments: [{ id: 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5', name: 'Склад' }], groups: [{ id: 'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6', name: 'Смена А' }], managers: [{ id: 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e7', name: 'Сидоров Иван' }] },
  courseOptions: [{ id: courseA, title: 'Охрана труда' }, { id: courseB, title: 'Складская приёмка' }],
};

const rowDone = { status: 'completed' as const, lessonsTotal: 4, lessonsCompleted: 4, lessonsPercent: 100, testPercent: 90, testScore: 9, attempts: 2, testResult: 'passed' as const, startedAt: '2026-11-01T10:00:00.000Z', completedAt: '2026-11-04T10:00:00.000Z', durationMinutes: 4320, dueAt: '2026-11-10T00:00:00.000Z', overdue: false, certificate: { status: 'issued' as const, issuedAt: '2026-11-04T10:00:00.000Z' } };
const rowFailed = { status: 'in_progress' as const, lessonsTotal: 4, lessonsCompleted: 3, lessonsPercent: 75, testPercent: 40, testScore: 4, attempts: 1, testResult: 'failed' as const, startedAt: '2026-11-02T10:00:00.000Z', completedAt: null, durationMinutes: null, dueAt: '2026-11-05T00:00:00.000Z', overdue: true, certificate: null };

export const courseReportFixture: CourseReport = {
  period: { from: null, to: null }, durationBasis: 'calendar', truncated: false, course: { id: courseA, title: 'Охрана труда' }, summary: summaryA,
  rows: [{ courseId: courseA, userId: userA, ...rowDone, user: people[userA] }, { courseId: courseA, userId: userB, ...rowFailed, user: people[userB] }],
};

export const userReportFixture: UserReport = {
  period: { from: null, to: null }, durationBasis: 'calendar', truncated: false, user: people[userA],
  summary: { assigned: 2, completed: 1, passed: 1, avgPercent: 90, certificates: 1 },
  rows: [{ courseId: courseA, courseTitle: 'Охрана труда', userId: userA, ...rowDone }, { courseId: courseB, courseTitle: 'Складская приёмка', userId: userA, status: 'not_started', lessonsTotal: 3, lessonsCompleted: 0, lessonsPercent: 0, testPercent: null, testScore: null, attempts: 0, testResult: 'pending', startedAt: null, completedAt: null, durationMinutes: null, dueAt: null, overdue: false, certificate: null }],
};

export async function installCourseAnalyticsMocks(page: Page, role: 'admin' | 'manager' | 'instructor') {
  const requests: URL[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', firstName: 'Course', lastName: 'Viewer', email: 'viewer@example.invalid', roles: [role], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/reports/course-analytics') { requests.push(url); return route.fulfill({ json: listFixture }); }
    const course = /^\/reports\/course-analytics\/courses\/([^/]+)$/.exec(path);
    if (course) {
      requests.push(url);
      if (course[1] === missing) return route.fulfill({ status: 404, json: { statusCode: 404, message: 'Course not found' } });
      return route.fulfill({ json: courseReportFixture });
    }
    const user = /^\/reports\/course-analytics\/users\/([^/]+)$/.exec(path);
    if (user) {
      requests.push(url);
      if (user[1] === forbiddenUser) return route.fulfill({ status: 403, json: { statusCode: 403, message: 'Forbidden' } });
      return route.fulfill({ json: userReportFixture });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
  });
  return requests;
}

export const missingCourse = missing;

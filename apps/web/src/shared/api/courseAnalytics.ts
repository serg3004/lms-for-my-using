import { apiRequest } from '../apiClient.js';

/** PR 474: client of the course and user analytics (API: `/reports/course-analytics`, PR 473). */

export type CourseAnalyticsQuery = {
  from?: string;
  to?: string;
  departmentId?: string;
  groupId?: string;
  managerId?: string;
  courseIds?: string[];
};

export type CourseTestResult = 'passed' | 'failed' | 'pending' | 'no_test';
export type CourseUserStatus = 'not_started' | 'in_progress' | 'completed';

export type CourseAnalyticsSummary = {
  courseId: string;
  assigned: number;
  started: number;
  completed: number;
  completedPercent: number;
  passed: number;
  failed: number;
  overdue: number;
  avgPercent: number | null;
  medianPercent: number | null;
  avgDurationMinutes: number | null;
};

export type CourseAnalyticsUserRow = {
  courseId: string;
  userId: string;
  status: CourseUserStatus;
  lessonsTotal: number;
  lessonsCompleted: number;
  lessonsPercent: number;
  testPercent: number | null;
  testScore: number | null;
  attempts: number;
  testResult: CourseTestResult;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  dueAt: string | null;
  overdue: boolean;
  certificate: { status: 'issued' | 'revoked'; issuedAt: string } | null;
};

type Named = { id: string; name: string };
type Person = { id: string; firstName: string; lastName: string; email: string };

export type CourseAnalyticsList = {
  period: { from: string | null; to: string | null };
  durationBasis: 'calendar';
  truncated: boolean;
  courses: Array<CourseAnalyticsSummary & { title: string }>;
  filterOptions: { departments: Named[]; groups: Named[]; managers: Named[] };
  courseOptions: Array<{ id: string; title: string }>;
};

export type CourseReport = {
  period: { from: string | null; to: string | null };
  durationBasis: 'calendar';
  truncated: boolean;
  course: { id: string; title: string };
  summary: CourseAnalyticsSummary | null;
  rows: Array<CourseAnalyticsUserRow & { user: Person | null }>;
};

export type UserReport = {
  period: { from: string | null; to: string | null };
  durationBasis: 'calendar';
  truncated: boolean;
  user: Person;
  summary: { assigned: number; completed: number; passed: number; avgPercent: number | null; certificates: number };
  rows: Array<CourseAnalyticsUserRow & { courseTitle: string }>;
};

function queryString(query: CourseAnalyticsQuery) {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.departmentId) params.set('departmentId', query.departmentId);
  if (query.groupId) params.set('groupId', query.groupId);
  if (query.managerId) params.set('managerId', query.managerId);
  if (query.courseIds?.length) params.set('courseIds', query.courseIds.join(','));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function getCourseAnalytics(query: CourseAnalyticsQuery) {
  return apiRequest<CourseAnalyticsList>(`/reports/course-analytics${queryString(query)}`);
}

export function getCourseReport(courseId: string, query: CourseAnalyticsQuery) {
  return apiRequest<CourseReport>(`/reports/course-analytics/courses/${encodeURIComponent(courseId)}${queryString(query)}`);
}

export function getUserReport(userId: string, query: CourseAnalyticsQuery) {
  return apiRequest<UserReport>(`/reports/course-analytics/users/${encodeURIComponent(userId)}${queryString(query)}`);
}

export type CourseAnalyticsExportView = 'courses' | 'course' | 'user';
export type CourseAnalyticsExport = { filename: string; sheetName: string; csv: string; rows: (string | number)[][]; rowCount: number };

/** PR 475: the rows of the current view (same filters, scope and audit as the screen); the file itself is built in the browser. */
export function exportCourseAnalytics(view: CourseAnalyticsExportView, ids: { courseId?: string; userId?: string }, query: CourseAnalyticsQuery, format: 'csv' | 'xlsx') {
  const params = new URLSearchParams(queryString(query).replace(/^\?/, ''));
  params.set('view', view);
  params.set('format', format);
  if (ids.courseId) params.set('courseId', ids.courseId);
  if (ids.userId) params.set('userId', ids.userId);
  return apiRequest<CourseAnalyticsExport>(`/reports/course-analytics/export?${params.toString()}`);
}

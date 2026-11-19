import { useMemo, useRef, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import type { TFunction } from 'i18next';

import {
  getCourseAnalytics,
  getCourseReport,
  getUserReport,
  type CourseAnalyticsList,
  type CourseAnalyticsQuery,
  type CourseAnalyticsUserRow,
  type CourseReport,
  type CourseTestResult,
  type CourseUserStatus,
  type UserReport,
} from '../shared/api/courseAnalytics.js';
import { ApiClientError } from '../shared/apiClient.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { Card, DataTable, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import type { AsyncDataState } from '../shared/asyncData.js';
import { useAsyncData } from '../shared/useAsyncData.js';

/**
 * PR 474: "Course analytics" for administrator, manager and instructor: a table of courses, a report per course
 * (a row per assigned employee) and a report per employee. Data and access rules come from PR 473; filters live in
 * the address so a view can be shared and the browser Back button works.
 */

export type CourseAnalyticsLayout = ComponentType<{ children: ReactNode; currentPath?: string }>;

type Loaded<T> = { kind: 'ok'; data: T } | { kind: 'forbidden' };

async function guard<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { kind: 'ok', data: await load() };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 403) return { kind: 'forbidden' };
    throw error;
  }
}

export function formatDuration(t: TFunction, minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return t('courseAnalytics.durationMinutes', { count: minutes });
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days === 0) return t('courseAnalytics.durationHours', { count: hours });
  return t('courseAnalytics.durationDays', { days, hours });
}

function personName(person: { firstName: string; lastName: string; email: string } | null) {
  if (!person) return '—';
  return [person.lastName, person.firstName].filter(Boolean).join(' ') || person.email;
}

const percent = (value: number | null) => (value === null ? '—' : `${value}%`);

function dayStart(value: string) { return new Date(`${value}T00:00:00`).toISOString(); }
function dayEnd(value: string) { return new Date(`${value}T23:59:59.999`).toISOString(); }

function useFilters() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const groupId = params.get('groupId') ?? '';
  const managerId = params.get('managerId') ?? '';
  const courseId = params.get('course') ?? '';
  const periodInvalid = Boolean(from && to && from > to);
  const query: CourseAnalyticsQuery = {
    from: from ? dayStart(from) : undefined,
    to: to ? dayEnd(to) : undefined,
    departmentId: departmentId || undefined,
    groupId: groupId || undefined,
    managerId: managerId || undefined,
    courseIds: courseId ? [courseId] : undefined,
  };
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }
  return { params, from, to, departmentId, groupId, managerId, courseId, periodInvalid, query, update, queryKey: params.toString() };
}

const labelStyle = { display: 'grid', gap: 6, fontWeight: 600 } as const;

function Header({ title, subtitle, back }: { title: string; subtitle?: string; back?: ReactNode }) {
  const { t } = useTranslation();
  return <header style={{ marginBottom: 20 }}>
    {back}
    <div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', margin: '8px 0' }}>{t('courseAnalytics.eyebrow')}</div>
    <h1 style={{ margin: 0, fontSize: 'clamp(26px,4vw,34px)' }}>{title}</h1>
    {subtitle ? <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{subtitle}</p> : null}
  </header>;
}

function Notes({ truncated }: { truncated: boolean }) {
  const { t } = useTranslation();
  return <div style={{ display: 'grid', gap: 6, margin: '12px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
    <span>{t('courseAnalytics.timeNote')}</span>
    {truncated ? <span role="status">{t('courseAnalytics.truncated')}</span> : null}
  </div>;
}

function statusLabel(t: TFunction, status: CourseUserStatus) {
  return t(`courseAnalytics.status.${status}`);
}

function resultLabel(t: TFunction, result: CourseTestResult) {
  return t(`courseAnalytics.result.${result}`);
}

function ResultBadge({ result }: { result: CourseTestResult }) {
  const { t } = useTranslation();
  const color = result === 'passed' ? 'var(--color-success, #1a7f37)' : result === 'failed' ? 'var(--color-danger, #c0392b)' : 'var(--color-text-muted)';
  return <strong style={{ color }}>{resultLabel(t, result)}</strong>;
}

function certificateLabel(t: TFunction, row: CourseAnalyticsUserRow) {
  if (!row.certificate) return '—';
  return row.certificate.status === 'issued' ? t('courseAnalytics.certificateIssued') : t('courseAnalytics.certificateRevoked');
}

function dateCell(t: TFunction, value: string | null) {
  return formatNullableDate(value, '—', undefined, { dateStyle: 'medium' });
}

function State<T>({ state, children, Layout, currentPath }: {
  state: AsyncDataState<Loaded<T>>;
  children: (data: T) => ReactNode;
  Layout: CourseAnalyticsLayout;
  currentPath: string;
}) {
  const { t } = useTranslation();
  if (state.status === 'loading') return <Layout currentPath={currentPath}><PageState message={t('courseAnalytics.loading')} variant="loading" /></Layout>;
  if (state.status === 'notFound') return <Layout currentPath={currentPath}><PageState message={t('courseAnalytics.notFound')} variant="error" /></Layout>;
  if (state.status !== 'loaded') return <Layout currentPath={currentPath}><PageState message={t('courseAnalytics.loadError')} variant="error" /></Layout>;
  if (state.data.kind === 'forbidden') return <Layout currentPath={currentPath}><PageState message={t('courseAnalytics.forbidden')} variant="error" /></Layout>;
  return <Layout currentPath={currentPath}>{children(state.data.data)}</Layout>;
}

function NoticeValidation() {
  const { t } = useTranslation();
  return <p role="alert" style={{ color: 'var(--color-danger, #c0392b)', margin: '0 0 12px' }}>{t('courseAnalytics.periodInvalid')}</p>;
}

function PeriodFields({ filters }: { filters: ReturnType<typeof useFilters> }) {
  const { t } = useTranslation();
  return <>
    <label style={labelStyle}>{t('courseAnalytics.from')}<input className="ds-input" type="date" value={filters.from} aria-invalid={filters.periodInvalid} onChange={(event) => filters.update('from', event.target.value)} /></label>
    <label style={labelStyle}>{t('courseAnalytics.to')}<input className="ds-input" type="date" value={filters.to} aria-invalid={filters.periodInvalid} onChange={(event) => filters.update('to', event.target.value)} /></label>
  </>;
}

function CoursesView({ Layout, basePath }: { Layout: CourseAnalyticsLayout; basePath: string }) {
  const { t } = useTranslation();
  const filters = useFilters();
  const options = useRef<Pick<CourseAnalyticsList, 'filterOptions' | 'courseOptions'>>({ filterOptions: { departments: [], groups: [], managers: [] }, courseOptions: [] });
  const { state } = useAsyncData<Loaded<CourseAnalyticsList>>(
    () => (filters.periodInvalid ? Promise.resolve({ kind: 'forbidden' as const }) : guard(() => getCourseAnalytics(filters.query))),
    [filters.queryKey],
    { unauthenticated: t('courseAnalytics.loadError'), error: t('courseAnalytics.loadError') },
  );
  if (state.status === 'loaded' && state.data.kind === 'ok') {
    // The filters must not vanish (or lose the course list) while a filter reloads the data.
    const { filterOptions, courseOptions } = state.data.data;
    if (!filters.courseId) options.current = { filterOptions, courseOptions };
    else options.current = { filterOptions, courseOptions: options.current.courseOptions };
  }
  const { filterOptions, courseOptions } = options.current;

  const filterBar = <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 20 }}>
    <PeriodFields filters={filters} />
    {courseOptions.length > 0 && <label style={labelStyle}>{t('courseAnalytics.course')}<select className="ds-input" value={filters.courseId} onChange={(event) => filters.update('course', event.target.value)}>
      <option value="">{t('courseAnalytics.allCourses')}</option>{courseOptions.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>}
    {filterOptions.departments.length > 0 && <label style={labelStyle}>{t('courseAnalytics.department')}<select className="ds-input" value={filters.departmentId} onChange={(event) => filters.update('departmentId', event.target.value)}>
      <option value="">{t('courseAnalytics.allDepartments')}</option>{filterOptions.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {filterOptions.groups.length > 0 && <label style={labelStyle}>{t('courseAnalytics.group')}<select className="ds-input" value={filters.groupId} onChange={(event) => filters.update('groupId', event.target.value)}>
      <option value="">{t('courseAnalytics.allGroups')}</option>{filterOptions.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {filterOptions.managers.length > 0 && <label style={labelStyle}>{t('courseAnalytics.manager')}<select className="ds-input" value={filters.managerId} onChange={(event) => filters.update('managerId', event.target.value)}>
      <option value="">{t('courseAnalytics.allManagers')}</option>{filterOptions.managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
  </Card>;

  if (filters.periodInvalid) {
    return <Layout currentPath={basePath}><Header title={t('courseAnalytics.title')} subtitle={t('courseAnalytics.subtitle')} />{filterBar}<NoticeValidation /></Layout>;
  }
  return <State state={state} Layout={Layout} currentPath={basePath}>{(data: CourseAnalyticsList) => {
    const totals = data.courses.reduce((sum, course) => ({
      assigned: sum.assigned + course.assigned, completed: sum.completed + course.completed, passed: sum.passed + course.passed,
      failed: sum.failed + course.failed, overdue: sum.overdue + course.overdue,
    }), { assigned: 0, completed: 0, passed: 0, failed: 0, overdue: 0 });
    const columns: Column<CourseAnalyticsList['courses'][number]>[] = [
      { key: 'course', label: t('courseAnalytics.course'), priority: 'primary', render: (row) => <Link to={`${basePath}/course/${row.courseId}${filters.params.toString() ? `?${filters.params.toString()}` : ''}`}>{row.title}</Link> },
      { key: 'assigned', label: t('courseAnalytics.assigned'), priority: 'primary', align: 'end', render: (row) => row.assigned },
      { key: 'completed', label: t('courseAnalytics.completed'), priority: 'primary', align: 'end', render: (row) => `${row.completed} (${row.completedPercent}%)` },
      { key: 'passed', label: t('courseAnalytics.passed'), priority: 'secondary', align: 'end', render: (row) => row.passed },
      { key: 'failed', label: t('courseAnalytics.failed'), priority: 'secondary', align: 'end', render: (row) => row.failed },
      { key: 'avg', label: t('courseAnalytics.avgScore'), priority: 'secondary', align: 'end', render: (row) => percent(row.avgPercent) },
      { key: 'median', label: t('courseAnalytics.medianScore'), priority: 'tertiary', align: 'end', render: (row) => percent(row.medianPercent) },
      { key: 'time', label: t('courseAnalytics.avgTime'), priority: 'secondary', render: (row) => formatDuration(t, row.avgDurationMinutes) },
      { key: 'overdue', label: t('courseAnalytics.overdue'), priority: 'secondary', align: 'end', render: (row) => row.overdue },
    ];
    return <>
      <Header title={t('courseAnalytics.title')} subtitle={t('courseAnalytics.subtitle')} />
      {filterBar}
      <StatsGrid>
        <StatCard label={t('courseAnalytics.assigned')} value={totals.assigned} />
        <StatCard label={t('courseAnalytics.completed')} value={totals.completed} />
        <StatCard label={t('courseAnalytics.passed')} value={totals.passed} />
        <StatCard label={t('courseAnalytics.failed')} value={totals.failed} />
        <StatCard label={t('courseAnalytics.overdue')} value={totals.overdue} />
      </StatsGrid>
      <Notes truncated={data.truncated} />
      <DataTable columns={columns} density="dense" emptyMessage={t('courseAnalytics.empty')} keyExtractor={(row) => row.courseId} label={t('courseAnalytics.tableLabel')} rows={data.courses}
        responsiveDetails={{ label: t('courseAnalytics.details'), expandLabel: (row) => `${t('courseAnalytics.details')}: ${row.title}`, collapseLabel: (row) => `${t('courseAnalytics.details')}: ${row.title}` }} />
    </>;
  }}</State>;
}

function BackLink({ to, label }: { to: string; label: string }) {
  return <Link to={to}>← {label}</Link>;
}

function CourseView({ Layout, basePath }: { Layout: CourseAnalyticsLayout; basePath: string }) {
  const { t } = useTranslation();
  const { courseId = '' } = useParams();
  const filters = useFilters();
  const search = filters.params.toString() ? `?${filters.params.toString()}` : '';
  const { state } = useAsyncData<Loaded<CourseReport>>(
    () => (filters.periodInvalid ? Promise.resolve({ kind: 'forbidden' as const }) : guard(() => getCourseReport(courseId, filters.query))),
    [courseId, filters.queryKey],
    { unauthenticated: t('courseAnalytics.loadError'), error: t('courseAnalytics.loadError'), notFound: t('courseAnalytics.notFound') },
  );
  if (filters.periodInvalid) return <Layout currentPath={basePath}><Header title={t('courseAnalytics.courseReport')} /><NoticeValidation /></Layout>;
  return <State state={state} Layout={Layout} currentPath={basePath}>{(data: CourseReport) => {
    const columns: Column<CourseReport['rows'][number]>[] = [
      { key: 'user', label: t('courseAnalytics.employee'), priority: 'primary', render: (row) => <Link to={`${basePath}/user/${row.userId}${search}`}>{personName(row.user)}</Link> },
      { key: 'status', label: t('courseAnalytics.statusLabel'), priority: 'primary', render: (row) => statusLabel(t, row.status) },
      { key: 'lessons', label: t('courseAnalytics.lessons'), priority: 'primary', align: 'end', render: (row) => `${row.lessonsCompleted}/${row.lessonsTotal} (${row.lessonsPercent}%)` },
      { key: 'result', label: t('courseAnalytics.testResult'), priority: 'primary', render: (row) => <ResultBadge result={row.testResult} /> },
      { key: 'score', label: t('courseAnalytics.testScore'), priority: 'secondary', align: 'end', render: (row) => percent(row.testPercent) },
      { key: 'attempts', label: t('courseAnalytics.attempts'), priority: 'secondary', align: 'end', render: (row) => row.attempts },
      { key: 'started', label: t('courseAnalytics.startedAt'), priority: 'tertiary', render: (row) => dateCell(t, row.startedAt) },
      { key: 'finished', label: t('courseAnalytics.completedAt'), priority: 'tertiary', render: (row) => dateCell(t, row.completedAt) },
      { key: 'time', label: t('courseAnalytics.time'), priority: 'secondary', render: (row) => formatDuration(t, row.durationMinutes) },
      { key: 'due', label: t('courseAnalytics.dueAt'), priority: 'secondary', render: (row) => <>{dateCell(t, row.dueAt)}{row.overdue ? <> · <strong>{t('courseAnalytics.overdueMark')}</strong></> : null}</> },
    ];
    const summary = data.summary;
    return <>
      <Header title={data.course.title} subtitle={t('courseAnalytics.courseReport')} back={<BackLink to={`${basePath}${search}`} label={t('courseAnalytics.backToCourses')} />} />
      {summary ? <StatsGrid>
        <StatCard label={t('courseAnalytics.assigned')} value={summary.assigned} />
        <StatCard label={t('courseAnalytics.completed')} value={`${summary.completed} (${summary.completedPercent}%)`} />
        <StatCard label={t('courseAnalytics.passed')} value={summary.passed} />
        <StatCard label={t('courseAnalytics.failed')} value={summary.failed} />
        <StatCard label={t('courseAnalytics.avgScore')} value={percent(summary.avgPercent)} />
        <StatCard label={t('courseAnalytics.avgTime')} value={formatDuration(t, summary.avgDurationMinutes)} />
      </StatsGrid> : null}
      <Notes truncated={data.truncated} />
      <DataTable columns={columns} density="dense" emptyMessage={t('courseAnalytics.empty')} keyExtractor={(row) => row.userId} label={t('courseAnalytics.employeesTable')} rows={data.rows}
        responsiveDetails={{ label: t('courseAnalytics.details'), expandLabel: (row) => `${t('courseAnalytics.details')}: ${personName(row.user)}`, collapseLabel: (row) => `${t('courseAnalytics.details')}: ${personName(row.user)}` }} />
    </>;
  }}</State>;
}

function UserView({ Layout, basePath }: { Layout: CourseAnalyticsLayout; basePath: string }) {
  const { t } = useTranslation();
  const { userId = '' } = useParams();
  const filters = useFilters();
  const search = filters.params.toString() ? `?${filters.params.toString()}` : '';
  const { state } = useAsyncData<Loaded<UserReport>>(
    () => (filters.periodInvalid ? Promise.resolve({ kind: 'forbidden' as const }) : guard(() => getUserReport(userId, filters.query))),
    [userId, filters.queryKey],
    { unauthenticated: t('courseAnalytics.loadError'), error: t('courseAnalytics.loadError'), notFound: t('courseAnalytics.notFound') },
  );
  if (filters.periodInvalid) return <Layout currentPath={basePath}><Header title={t('courseAnalytics.userReport')} /><NoticeValidation /></Layout>;
  return <State state={state} Layout={Layout} currentPath={basePath}>{(data: UserReport) => {
    const columns: Column<UserReport['rows'][number]>[] = [
      { key: 'course', label: t('courseAnalytics.course'), priority: 'primary', render: (row) => <Link to={`${basePath}/course/${row.courseId}${search}`}>{row.courseTitle}</Link> },
      { key: 'status', label: t('courseAnalytics.statusLabel'), priority: 'primary', render: (row) => statusLabel(t, row.status) },
      { key: 'lessons', label: t('courseAnalytics.lessons'), priority: 'primary', align: 'end', render: (row) => `${row.lessonsCompleted}/${row.lessonsTotal} (${row.lessonsPercent}%)` },
      { key: 'result', label: t('courseAnalytics.testResult'), priority: 'primary', render: (row) => <ResultBadge result={row.testResult} /> },
      { key: 'score', label: t('courseAnalytics.testScore'), priority: 'secondary', align: 'end', render: (row) => percent(row.testPercent) },
      { key: 'attempts', label: t('courseAnalytics.attempts'), priority: 'secondary', align: 'end', render: (row) => row.attempts },
      { key: 'started', label: t('courseAnalytics.startedAt'), priority: 'tertiary', render: (row) => dateCell(t, row.startedAt) },
      { key: 'finished', label: t('courseAnalytics.completedAt'), priority: 'tertiary', render: (row) => dateCell(t, row.completedAt) },
      { key: 'time', label: t('courseAnalytics.time'), priority: 'secondary', render: (row) => formatDuration(t, row.durationMinutes) },
      { key: 'due', label: t('courseAnalytics.dueAt'), priority: 'secondary', render: (row) => <>{dateCell(t, row.dueAt)}{row.overdue ? <> · <strong>{t('courseAnalytics.overdueMark')}</strong></> : null}</> },
      { key: 'certificate', label: t('courseAnalytics.certificate'), priority: 'tertiary', render: (row) => certificateLabel(t, row) },
    ];
    return <>
      <Header title={personName(data.user)} subtitle={t('courseAnalytics.userReport')} back={<BackLink to={`${basePath}${search}`} label={t('courseAnalytics.backToCourses')} />} />
      <StatsGrid>
        <StatCard label={t('courseAnalytics.assignedCourses')} value={data.summary.assigned} />
        <StatCard label={t('courseAnalytics.completed')} value={data.summary.completed} />
        <StatCard label={t('courseAnalytics.passed')} value={data.summary.passed} />
        <StatCard label={t('courseAnalytics.avgScore')} value={percent(data.summary.avgPercent)} />
        <StatCard label={t('courseAnalytics.certificates')} value={data.summary.certificates} />
      </StatsGrid>
      <Notes truncated={data.truncated} />
      <DataTable columns={columns} density="dense" emptyMessage={t('courseAnalytics.emptyUser')} keyExtractor={(row) => row.courseId} label={t('courseAnalytics.coursesTable')} rows={data.rows}
        responsiveDetails={{ label: t('courseAnalytics.details'), expandLabel: (row) => `${t('courseAnalytics.details')}: ${row.courseTitle}`, collapseLabel: (row) => `${t('courseAnalytics.details')}: ${row.courseTitle}` }} />
    </>;
  }}</State>;
}

/** Mounted under `<basePath>/*` of a role: the list, `course/:courseId` and `user/:userId`. */
export function CourseAnalyticsRoutes({ Layout, basePath }: { Layout: CourseAnalyticsLayout; basePath: string }) {
  const stable = useMemo(() => Layout, [Layout]);
  return <Routes>
    <Route index element={<CoursesView Layout={stable} basePath={basePath} />} />
    <Route path="course/:courseId" element={<CourseView Layout={stable} basePath={basePath} />} />
    <Route path="user/:userId" element={<UserView Layout={stable} basePath={basePath} />} />
  </Routes>;
}

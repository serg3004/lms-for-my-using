import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { DataTable, EmptyState, PageState, StatCard, StatsGrid, StatusBadge, type Column } from '../shared/ui.js';
import { formatNullableDate } from '../shared/formatDate.js';
import type { PaginatedResponse } from '../shared/api/types.js';

type Course = { id: string; organizationId: string; title: string };
type User = { id: string; email: string; name: string | null };
type Assessment = { id: string; courseId: string; title: string; passingScore: number; status: string };
type Progress = { id: string; courseId: string; userId: string; status: string; score: number | null; completedAt: string | null };
type Certificate = { id: string; courseId: string; userId: string; issuedAt: string; status: string };
type AssessmentResult = { id: string; assessmentId: string; userId: string; score: number; maxScore: number; percentage: number; passed: boolean; completedAt: string | null };
type ReportUser = { id: string; firstName: string; lastName: string; email: string };
type ReportProgress = Omit<Progress, 'courseId' | 'userId'> & { course: { id: string; title: string }; user: ReportUser };
type ReportCertificate = Omit<Certificate, 'courseId' | 'userId'> & { course: { id: string; title: string }; user: ReportUser };
type OverdueAssignment = { id: string; dueAt: string; course: { id: string; title: string }; user: ReportUser | null; group: { id: string; name: string } | null };
type ReportsSummary = { progress: ReportProgress[]; certificates: ReportCertificate[]; overdueAssignments: OverdueAssignment[] };

type AdminResultsData = {
  courses: Course[];
  users: User[];
  assessments: Assessment[];
  progressItems: Progress[];
  certificates: Certificate[];
  assessmentResults: AssessmentResult[];
  overdueAssignments: OverdueAssignment[];
  selectedAssessmentId: string;
};

export function findCourseTitle(courses: Course[], courseId: string) {
  return courses.find((course) => course.id === courseId)?.title ?? courseId;
}

export function findUserLabel(users: User[], userId: string) {
  const user = users.find((item) => item.id === userId);
  return user?.name || user?.email || userId;
}

export function findUserEmail(users: User[], userId: string) {
  return users.find((item) => item.id === userId)?.email ?? '';
}

export function progressPercent(progress: Progress) {
  return progress.status === 'completed' ? 100 : (progress.score ?? 0);
}

export function serializeCsv(rows: string[][]) {
  return rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function buildProgressExportRows(courses: Course[], users: User[], progressItems: Progress[], t: TFunction) {
  const header = [
    t('admin.results.col.learner', 'Learner'),
    t('admin.results.col.course', 'Course'),
    t('admin.results.col.progress', 'Progress'),
    t('admin.results.col.score', 'Score'),
  ];
  const rows = progressItems.map((progress) => [
    findUserLabel(users, progress.userId),
    findCourseTitle(courses, progress.courseId),
    `${progressPercent(progress)}%`,
    progress.score != null ? `${progress.score}%` : '',
  ]);
  return [header, ...rows];
}

export function downloadResultsCsv(courses: Course[], users: User[], progressItems: Progress[], t: TFunction) {
  const lines = serializeCsv(buildProgressExportRows(courses, users, progressItems, t));

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildAssessmentResultsExportRows(results: AssessmentResult[], users: User[], t: TFunction): string[][] {
  const header = [
    t('admin.results.col.learner', 'Learner'),
    t('admin.results.col.score', 'Score'),
    t('admin.results.col.status', 'Status'),
    t('admin.results.col.date', 'Date'),
  ];
  const rows = results.map((result) => [
    findUserLabel(users, result.userId),
    `${result.score}/${result.maxScore} (${result.percentage}%)`,
    result.passed ? t('admin.results.passed', 'Passed') : t('admin.results.failed', 'Failed'),
    formatNullableDate(result.completedAt, '—'),
  ]);
  return [header, ...rows];
}

export function downloadAssessmentResultsCsv(results: AssessmentResult[], users: User[], t: TFunction) {
  const lines = serializeCsv(buildAssessmentResultsExportRows(results, users, t));

  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `assessment-results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadAssessmentResultsXlsx(results: AssessmentResult[], users: User[], t: TFunction) {
  const rows = buildAssessmentResultsExportRows(results, users, t);
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Results');
  worksheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `assessment-results-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminResultsCertificatesPage() {
  const { t } = useTranslation();
  const [courseId, setCourseId] = useState('');
  const [userId, setUserId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [assessmentAttemptId, setAssessmentAttemptId] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const navItems: AdminNavItem[] = [
    { label: t('admin.results.title', 'Results'), href: '/admin/results', isCurrent: true },
  ];

  const { state: loadState, reload: loadData } = useAsyncData<AdminResultsData>(
    async () => {
      const [{ items: courses }, { items: users }, assessments, reports] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
        apiRequest<PaginatedResponse<User>>('/users?pageSize=200'),
        apiRequest<Assessment[]>('/assessments'),
        apiRequest<ReportsSummary>('/reports/summary'),
      ]);
      const progressItems = reports.progress.map((item) => ({ ...item, courseId: item.course.id, userId: item.user.id }));
      const certificates = reports.certificates.map((item) => ({ ...item, courseId: item.course.id, userId: item.user.id }));
      const selectedAssessmentId = assessmentId || assessments[0]?.id || '';
      const assessmentResults = selectedAssessmentId
        ? await apiRequest<AssessmentResult[]>(`/assessments/${encodeURIComponent(selectedAssessmentId)}/results`)
        : [];

      return { courses, users, assessments, progressItems, certificates, overdueAssignments: reports.overdueAssignments, assessmentResults, selectedAssessmentId };
    },
    [assessmentId, t],
    {
      unauthenticated: t('admin.results.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.results.loadError', 'Unable to load results dashboard.'),
    },
  );

  useEffect(() => {
    if (loadState.status === 'loaded') {
      setCourseId((current) => current || loadState.data.courses[0]?.id || '');
      setUserId((current) => current || loadState.data.users[0]?.id || '');
      setAssessmentId(loadState.data.selectedAssessmentId);
    }
  }, [loadState]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.data.courses.find((course) => course.id === courseId) : undefined;
  }, [courseId, loadState]);

  function handleAssessmentChange(nextAssessmentId: string) {
    setAssessmentId(nextAssessmentId);
    setSubmitState({ status: 'idle' });
  }

  async function issueCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCourse || !userId) {
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Certificate>('/certificates', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          userId,
          assessmentAttemptId: assessmentAttemptId.trim() || undefined,
        }),
      });
      setAssessmentAttemptId('');
      setSubmitState({ status: 'idle' });
      await loadData();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.results.alreadyIssued', 'Certificate is already issued for this learner and course.')
          : t('admin.results.issueError', 'Unable to issue certificate.');
      setSubmitState({ status: 'error', message });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.results.loading', 'Loading results dashboard...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.results.title', 'Results')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.results.title', 'Results')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.results.eyebrow', 'Analytics')}
        title={t('admin.results.title', 'Results')}
        subtitle={t('admin.results.subtitle', 'Review learner progress, assessment results, and issue certificates.')}
        action={
          <button
            className="admin-btn admin-btn--primary"
            disabled={loadState.data.progressItems.length === 0}
            onClick={() => downloadResultsCsv(loadState.data.courses, loadState.data.users, loadState.data.progressItems, t)}
            type="button"
          >
            {t('admin.results.export', 'Export CSV')}
          </button>
        }
      />

      {(() => {
        const completedProgress = loadState.data.progressItems.filter((p) => p.status === 'completed');
        const avgCompletion =
          loadState.data.progressItems.length > 0
            ? Math.round((completedProgress.length / loadState.data.progressItems.length) * 100)
            : 0;
        const scored = loadState.data.progressItems.filter((p) => p.score != null);
        const avgScore =
          scored.length > 0
            ? Math.round(scored.reduce((sum, p) => sum + (p.score ?? 0), 0) / scored.length)
            : null;
        const issuedCertificates = loadState.data.certificates.filter((c) => c.status === 'issued').length;
        const overdueCount = loadState.data.overdueAssignments.length;

        return (
          <StatsGrid>
            <StatCard label={t('admin.results.stats.avgCompletion', 'Avg. completion')} value={`${avgCompletion}%`} />
            <StatCard label={t('admin.results.stats.avgScore', 'Avg. score')} value={avgScore != null ? `${avgScore}%` : '—'} />
            <StatCard label={t('admin.results.stats.certificates', 'Certificates issued')} value={issuedCertificates} />
            <StatCard label={t('admin.results.stats.overdue', 'Overdue assignments')} value={overdueCount} />
          </StatsGrid>
        );
      })()}

      <DataTable<Progress>
        label={t('admin.results.progressReport', 'Learner progress')}
        columns={[
          {
            key: 'learner',
            label: t('admin.results.col.learner', 'Learner'),
            render: (p) => (
              <>
                <div className="td-title">{findUserLabel(loadState.data.users, p.userId)}</div>
                <div className="td-meta">{findUserEmail(loadState.data.users, p.userId)}</div>
              </>
            ),
          },
          { key: 'course', label: t('admin.results.col.course', 'Course'), render: (p) => findCourseTitle(loadState.data.courses, p.courseId) },
          {
            key: 'progress',
            label: t('admin.results.col.progress', 'Progress'),
            render: (p) => (
              <div className="admin-results-bar">
                <span className="admin-results-bar__track">
                  <span className="admin-results-bar__fill" style={{ width: `${progressPercent(p)}%` }} />
                </span>
                <span className="admin-results-bar__value">{progressPercent(p)}%</span>
              </div>
            ),
          },
          {
            key: 'score',
            label: t('admin.results.col.score', 'Score'),
            render: (p) =>
              p.score != null ? (
                <StatusBadge tone={p.score >= 70 ? 'success' : 'danger'}>{`${p.score}%`}</StatusBadge>
              ) : (
                <StatusBadge>—</StatusBadge>
              ),
          },
        ] satisfies Column<Progress>[]}
        rows={loadState.data.progressItems}
        keyExtractor={(p) => p.id}
        emptyMessage={t('admin.results.noProgress', 'No progress records found.')}
      />

      <section className="admin-results-reports">
        <AdminCard>
          <h2>{t('admin.results.certificatesReport', 'Issued certificates')}</h2>
          <DataTable<Certificate>
            label={t('admin.results.certificatesReport', 'Issued certificates')}
            columns={[
              { key: 'learner', label: t('admin.results.col.learner', 'Learner'), render: (item) => findUserLabel(loadState.data.users, item.userId) },
              { key: 'course', label: t('admin.results.col.course', 'Course'), render: (item) => findCourseTitle(loadState.data.courses, item.courseId) },
              { key: 'date', label: t('admin.results.col.date', 'Date'), render: (item) => formatNullableDate(item.issuedAt, '—') },
            ] satisfies Column<Certificate>[]}
            rows={loadState.data.certificates}
            keyExtractor={(item) => item.id}
            emptyMessage={t('admin.results.noCertificates', 'No certificates have been issued yet.')}
          />
        </AdminCard>
        <AdminCard>
          <h2>{t('admin.results.overdueReport', 'Overdue assignments')}</h2>
          <DataTable<OverdueAssignment>
            label={t('admin.results.overdueReport', 'Overdue assignments')}
            columns={[
              { key: 'target', label: t('admin.results.col.learnerOrGroup', 'Learner or group'), render: (item) => item.user ? `${item.user.firstName} ${item.user.lastName}`.trim() || item.user.email : item.group?.name ?? '—' },
              { key: 'course', label: t('admin.results.col.course', 'Course'), render: (item) => item.course.title },
              { key: 'due', label: t('admin.results.col.dueDate', 'Due date'), render: (item) => formatNullableDate(item.dueAt, '—') },
            ] satisfies Column<OverdueAssignment>[]}
            rows={loadState.data.overdueAssignments}
            keyExtractor={(item) => item.id}
            emptyMessage={t('admin.results.noOverdue', 'There are no overdue assignments.')}
          />
        </AdminCard>
      </section>

      <section className="admin-results-secondary">
        <AdminCard>
          <h2>{t('admin.results.issueCertTitle', 'Issue certificate')}</h2>
          {loadState.data.courses.length === 0 || loadState.data.users.length === 0 ? (
            <EmptyState message={t('admin.results.noData', 'Create at least one course and user before issuing certificates.')} />
          ) : (
            <form onSubmit={issueCertificate}>
              <label>
                {t('admin.results.course', 'Course')}
                <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  {loadState.data.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('admin.results.learner', 'Learner')}
                <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                  {loadState.data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('admin.results.attemptId', 'Assessment attempt ID')}
                <input value={assessmentAttemptId} onChange={(event) => setAssessmentAttemptId(event.target.value)} />
              </label>
              {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
              <button type="submit" disabled={submitState.status === 'saving'}>
                {submitState.status === 'saving'
                  ? t('admin.results.issuing', 'Issuing...')
                  : t('admin.results.issue', 'Issue certificate')}
              </button>
            </form>
          )}
        </AdminCard>

        <AdminCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <h2>{t('admin.results.assessmentResultsTitle', 'Assessment results')}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="admin-btn"
                type="button"
                disabled={loadState.data.assessmentResults.length === 0}
                onClick={() => downloadAssessmentResultsCsv(loadState.data.assessmentResults, loadState.data.users, t)}
              >
                {t('admin.results.exportCsv', 'Export CSV')}
              </button>
              <button
                className="admin-btn"
                type="button"
                disabled={loadState.data.assessmentResults.length === 0}
                onClick={() => void downloadAssessmentResultsXlsx(loadState.data.assessmentResults, loadState.data.users, t)}
              >
                {t('admin.results.exportXlsx', 'Export Excel')}
              </button>
            </div>
          </div>
          {loadState.data.assessments.length === 0 ? (
            <EmptyState message={t('admin.results.noAssessments', 'No assessments found.')} />
          ) : (
            <>
              <label>
                {t('admin.results.assessment', 'Assessment')}
                <select value={assessmentId} onChange={(event) => handleAssessmentChange(event.target.value)}>
                  {loadState.data.assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title}
                    </option>
                  ))}
                </select>
              </label>
              <DataTable<AssessmentResult>
                label={t('admin.results.assessmentReport', 'Assessment results')}
                columns={[
                  { key: 'learner', label: t('admin.results.col.learner', 'Learner'), render: (r) => findUserLabel(loadState.data.users, r.userId) },
                  { key: 'score', label: t('admin.results.col.score', 'Score'), render: (r) => `${r.score}/${r.maxScore} · ${r.percentage}%` },
                  { key: 'status', label: t('admin.results.col.status', 'Status'), render: (r) => <StatusBadge tone={r.passed ? 'success' : 'danger'}>{r.passed ? t('admin.results.passed', 'Passed') : t('admin.results.failed', 'Failed')}</StatusBadge> },
                ] satisfies Column<AssessmentResult>[]}
                rows={loadState.data.assessmentResults}
                keyExtractor={(r) => r.id}
                emptyMessage={t('admin.results.noResults', 'No assessment results found.')}
              />
            </>
          )}
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
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

type LoadState =
  | { status: 'loading' }
  | {
      status: 'loaded';
      courses: Course[];
      users: User[];
      assessments: Assessment[];
      progressItems: Progress[];
      certificates: Certificate[];
      assessmentResults: AssessmentResult[];
    }
  | { status: 'error'; message: string };

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

export function downloadResultsCsv(courses: Course[], users: User[], progressItems: Progress[], t: TFunction) {
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
  const lines = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

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
  const lines = buildAssessmentResultsExportRows(results, users, t)
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

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
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  XLSX.writeFile(workbook, `assessment-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function AdminResultsCertificatesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [courseId, setCourseId] = useState('');
  const [userId, setUserId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [assessmentAttemptId, setAssessmentAttemptId] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const navItems: AdminNavItem[] = [
    { label: t('admin.results.title', 'Results'), href: '/admin/results', isCurrent: true },
  ];

  const loadData = useCallback(async (nextAssessmentId?: string) => {
    try {
      const [{ items: courses }, { items: users }, assessments, { items: progressItems }, { items: certificates }] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
        apiRequest<PaginatedResponse<User>>('/users?pageSize=200'),
        apiRequest<Assessment[]>('/assessments'),
        apiRequest<PaginatedResponse<Progress>>('/progress?pageSize=200'),
        apiRequest<PaginatedResponse<Certificate>>('/certificates?pageSize=200'),
      ]);
      const selectedAssessmentId = nextAssessmentId || assessmentId || assessments[0]?.id || '';
      const assessmentResults = selectedAssessmentId
        ? await apiRequest<AssessmentResult[]>(`/assessments/${encodeURIComponent(selectedAssessmentId)}/results`)
        : [];

      setCourseId((current) => current || courses[0]?.id || '');
      setUserId((current) => current || users[0]?.id || '');
      setAssessmentId(selectedAssessmentId);
      setLoadState({ status: 'loaded', courses, users, assessments, progressItems, certificates, assessmentResults });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.results.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.results.loadError', 'Unable to load results dashboard.');
      setLoadState({ status: 'error', message });
    }
  }, [assessmentId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((course) => course.id === courseId) : undefined;
  }, [courseId, loadState]);

  async function handleAssessmentChange(nextAssessmentId: string) {
    setAssessmentId(nextAssessmentId);
    setSubmitState({ status: 'idle' });
    await loadData(nextAssessmentId);
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
      await loadData(assessmentId);
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

  if (loadState.status === 'error') {
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
            disabled={loadState.progressItems.length === 0}
            onClick={() => downloadResultsCsv(loadState.courses, loadState.users, loadState.progressItems, t)}
            type="button"
          >
            {t('admin.results.export', 'Export CSV')}
          </button>
        }
      />

      {(() => {
        const completedProgress = loadState.progressItems.filter((p) => p.status === 'completed');
        const avgCompletion =
          loadState.progressItems.length > 0
            ? Math.round((completedProgress.length / loadState.progressItems.length) * 100)
            : 0;
        const scored = loadState.progressItems.filter((p) => p.score != null);
        const avgScore =
          scored.length > 0
            ? Math.round(scored.reduce((sum, p) => sum + (p.score ?? 0), 0) / scored.length)
            : null;
        const issuedCertificates = loadState.certificates.filter((c) => c.status === 'issued').length;
        const overdueCount = loadState.progressItems.filter((p) => p.status !== 'completed').length;

        return (
          <StatsGrid>
            <StatCard label={t('admin.results.stats.avgCompletion', 'Avg. completion')} value={`${avgCompletion}%`} />
            <StatCard label={t('admin.results.stats.avgScore', 'Avg. score')} value={avgScore != null ? `${avgScore}%` : '—'} />
            <StatCard label={t('admin.results.stats.certificates', 'Certificates issued')} value={issuedCertificates} />
            <StatCard label={t('admin.results.stats.pending', 'In progress')} value={overdueCount} />
          </StatsGrid>
        );
      })()}

      <DataTable<Progress>
        columns={[
          {
            key: 'learner',
            label: t('admin.results.col.learner', 'Learner'),
            render: (p) => (
              <>
                <div className="td-title">{findUserLabel(loadState.users, p.userId)}</div>
                <div className="td-meta">{findUserEmail(loadState.users, p.userId)}</div>
              </>
            ),
          },
          { key: 'course', label: t('admin.results.col.course', 'Course'), render: (p) => findCourseTitle(loadState.courses, p.courseId) },
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
        rows={loadState.progressItems}
        keyExtractor={(p) => p.id}
        emptyMessage={t('admin.results.noProgress', 'No progress records found.')}
      />

      <section className="admin-results-secondary">
        <AdminCard>
          <h2>{t('admin.results.issueCertTitle', 'Issue certificate')}</h2>
          {loadState.courses.length === 0 || loadState.users.length === 0 ? (
            <EmptyState message={t('admin.results.noData', 'Create at least one course and user before issuing certificates.')} />
          ) : (
            <form onSubmit={issueCertificate}>
              <label>
                {t('admin.results.course', 'Course')}
                <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  {loadState.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('admin.results.learner', 'Learner')}
                <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                  {loadState.users.map((user) => (
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
                disabled={loadState.assessmentResults.length === 0}
                onClick={() => downloadAssessmentResultsCsv(loadState.assessmentResults, loadState.users, t)}
              >
                {t('admin.results.exportCsv', 'Export CSV')}
              </button>
              <button
                className="admin-btn"
                type="button"
                disabled={loadState.assessmentResults.length === 0}
                onClick={() => void downloadAssessmentResultsXlsx(loadState.assessmentResults, loadState.users, t)}
              >
                {t('admin.results.exportXlsx', 'Export Excel')}
              </button>
            </div>
          </div>
          {loadState.assessments.length === 0 ? (
            <EmptyState message={t('admin.results.noAssessments', 'No assessments found.')} />
          ) : (
            <>
              <label>
                {t('admin.results.assessment', 'Assessment')}
                <select value={assessmentId} onChange={(event) => void handleAssessmentChange(event.target.value)}>
                  {loadState.assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title}
                    </option>
                  ))}
                </select>
              </label>
              <DataTable<AssessmentResult>
                columns={[
                  { key: 'learner', label: t('admin.results.col.learner', 'Learner'), render: (r) => findUserLabel(loadState.users, r.userId) },
                  { key: 'score', label: t('admin.results.col.score', 'Score'), render: (r) => `${r.score}/${r.maxScore} · ${r.percentage}%` },
                  { key: 'status', label: t('admin.results.col.status', 'Status'), render: (r) => <StatusBadge tone={r.passed ? 'success' : 'danger'}>{r.passed ? t('admin.results.passed', 'Passed') : t('admin.results.failed', 'Failed')}</StatusBadge> },
                ] satisfies Column<AssessmentResult>[]}
                rows={loadState.assessmentResults}
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

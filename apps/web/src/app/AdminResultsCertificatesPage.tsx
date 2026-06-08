import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string };
type User = { id: string; email: string; name: string | null };
type Assessment = { id: string; courseId: string; title: string; passingScore: number; status: string };
type Progress = { id: string; courseId: string; userId: string; status: string; score: number | null; completedAt: string | null };
type Certificate = { id: string; courseId: string; userId: string; issuedAt: string; status: string };
type AssessmentResult = { id: string; assessmentId: string; userId: string; score: number; maxScore: number; percentage: number; passed: boolean };

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

function findCourseTitle(courses: Course[], courseId: string) {
  return courses.find((course) => course.id === courseId)?.title ?? courseId;
}

function findUserLabel(users: User[], userId: string) {
  const user = users.find((item) => item.id === userId);
  return user?.name || user?.email || userId;
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
      const [courses, users, assessments, progressItems, certificates] = await Promise.all([
        apiRequest<Course[]>('/courses'),
        apiRequest<User[]>('/users'),
        apiRequest<Assessment[]>('/assessments'),
        apiRequest<Progress[]>('/progress'),
        apiRequest<Certificate[]>('/certificates'),
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
        title={t('admin.results.title', 'Results')}
        subtitle={t('admin.results.subtitle', 'Review learner progress, assessment results, and issue certificates.')}
      />

      <section className="admin-content-grid">
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
          <h2>{t('admin.results.assessmentResultsTitle', 'Assessment results')}</h2>
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
              {loadState.assessmentResults.length === 0 ? (
                <EmptyState message={t('admin.results.noResults', 'No assessment results found.')} />
              ) : (
                <table>
                  <tbody>
                    {loadState.assessmentResults.map((result) => (
                      <tr key={result.id}>
                        <td>{findUserLabel(loadState.users, result.userId)}</td>
                        <td>{result.score}/{result.maxScore} · {result.percentage}%</td>
                        <td>
                          <StatusBadge>{result.passed ? 'passed' : 'failed'}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.results.progressTitle', 'Course progress')}</h2>
          {loadState.progressItems.length === 0 ? (
            <EmptyState message={t('admin.results.noProgress', 'No progress records found.')} />
          ) : (
            <table>
              <tbody>
                {loadState.progressItems.map((progress) => (
                  <tr key={progress.id}>
                    <td>{findCourseTitle(loadState.courses, progress.courseId)}</td>
                    <td>{findUserLabel(loadState.users, progress.userId)}</td>
                    <td><StatusBadge>{progress.status}</StatusBadge></td>
                    <td>{progress.score ?? t('admin.results.noScore', 'No score')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.results.certificatesTitle', 'Issued certificates')}</h2>
          {loadState.certificates.length === 0 ? (
            <EmptyState message={t('admin.results.noCertificates', 'No certificates issued yet.')} />
          ) : (
            <table>
              <tbody>
                {loadState.certificates.map((certificate) => (
                  <tr key={certificate.id}>
                    <td>{findCourseTitle(loadState.courses, certificate.courseId)}</td>
                    <td>{findUserLabel(loadState.users, certificate.userId)}</td>
                    <td><StatusBadge>{certificate.status}</StatusBadge></td>
                    <td>{new Date(certificate.issuedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}

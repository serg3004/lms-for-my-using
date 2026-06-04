import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; status: string };
type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
};
type Assignment = {
  id: string;
  courseId: string;
  userId: string | null;
  groupId: string | null;
  status: string;
  dueAt: string | null;
};
type Progress = {
  id: string;
  courseId: string;
  lessonId: string | null;
  userId: string;
  status: string;
  score: number | null;
  completedAt: string | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; users: User[]; assignments: Assignment[]; progressItems: Progress[] }
  | { status: 'error'; message: string };

type AssignmentStatus = 'assigned' | 'completed' | 'cancelled';

const ASSIGNMENT_STATUSES: AssignmentStatus[] = ['assigned', 'completed', 'cancelled'];

function getUserLabel(user: User) {
  const fullName = [user.lastName, user.firstName].filter(Boolean).join(' ');
  return fullName || user.email;
}

function findCourseTitle(courses: Course[], courseId: string) {
  return courses.find((c) => c.id === courseId)?.title ?? courseId;
}

function findUserLabel(users: User[], userId: string | null, fallback: string) {
  if (!userId) return fallback;
  const user = users.find((u) => u.id === userId);
  return user ? getUserLabel(user) : userId;
}

export function AdminAssignmentCompletionPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [courseId, setCourseId] = useState('');
  const [userId, setUserId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [completionStatus, setCompletionStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [score, setScore] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const loadData = useCallback(async (nextCourseId?: string) => {
    try {
      const [courses, users, assignments, progressItems] = await Promise.all([
        apiRequest<Course[]>('/courses'),
        apiRequest<User[]>('/users'),
        apiRequest<Assignment[]>('/assignments'),
        apiRequest<Progress[]>('/progress'),
      ]);
      const selectedCourseId = nextCourseId ?? (courseId || courses[0]?.id || '');

      setCourseId(selectedCourseId);
      setUserId((current) => current || users[0]?.id || '');
      setLoadState({ status: 'loaded', courses, users, assignments, progressItems });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.assignments.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.assignments.loadError', 'Unable to load assignment management data.');
      setLoadState({ status: 'error', message });
    }
  }, [courseId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((c) => c.id === courseId) : undefined;
  }, [courseId, loadState]);

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse || !userId) {
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Assignment>('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          userId,
          status: 'assigned',
          dueAt: dueAt || undefined,
        }),
      });
      setDueAt('');
      setSubmitState({ status: 'idle' });
      await loadData(selectedCourse.id);
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.assignments.alreadyAssigned', 'This course is already assigned to the selected learner.')
          : t('admin.assignments.saveError', 'Unable to create assignment.');
      setSubmitState({ status: 'error', message });
    }
  }

  async function handleUpdateAssignmentStatus(assignmentId: string, newStatus: string) {
    try {
      const updated = await apiRequest<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, assignments: prev.assignments.map((a) => (a.id === assignmentId ? updated : a)) }
          : prev,
      );
    } catch {
      await loadData(courseId);
    }
  }

  async function handleRecordCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse || !userId) {
      return;
    }

    const scoreValue = score.trim() ? Number(score) : undefined;

    if (scoreValue !== undefined && (!Number.isInteger(scoreValue) || scoreValue < 0 || scoreValue > 100)) {
      setSubmitState({
        status: 'error',
        message: t('admin.assignments.invalidScore', 'Score must be an integer from 0 to 100.'),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Progress>('/progress', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          userId,
          status: completionStatus,
          score: scoreValue,
          completedAt: completionStatus === 'completed' ? new Date().toISOString() : undefined,
        }),
      });
      setScore('');
      setSubmitState({ status: 'idle' });
      await loadData(selectedCourse.id);
    } catch {
      setSubmitState({
        status: 'error',
        message: t('admin.assignments.progressError', 'Unable to record course completion progress.'),
      });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.assignments.loading', 'Loading assignment management...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.assignments.title', 'Assignments')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin">
          {t('admin.navLink', 'Admin')}
        </a>
        <nav className="admin-nav">
          <a className="admin-nav-link" href="/admin/courses">
            {t('admin.courseBuilder.title', 'Course builder')}
          </a>
          <a className="admin-nav-link" href="/admin/assignments" aria-current="page">
            {t('admin.assignments.title', 'Assignments')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.assignments.title', 'Assignments')}</h1>
            <p>{t('admin.assignments.subtitle', 'Assign courses to learners and track completion.')}</p>
          </div>
          <a href="/admin">{t('admin.assignments.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.assignments.createTitle', 'Assign course')}</h2>
            {loadState.courses.length === 0 || loadState.users.length === 0 ? (
              <EmptyState
                message={t(
                  'admin.assignments.noData',
                  'Create at least one course and user before assigning courses.',
                )}
              />
            ) : (
              <form className="admin-form" onSubmit={handleCreateAssignment}>
                <div className="admin-form__field">
                  <label>{t('admin.assignments.course', 'Course')}</label>
                  <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assignments.learner', 'Learner')}</label>
                  <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                    {loadState.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getUserLabel(user)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assignments.dueAt', 'Due date')}</label>
                  <input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="date" />
                </div>
                {submitState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">
                    {submitState.message}
                  </p>
                ) : null}
                <div className="admin-form__actions">
                  <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
                    {submitState.status === 'saving'
                      ? t('admin.assignments.saving', 'Saving...')
                      : t('admin.assignments.create', 'Assign course')}
                  </button>
                </div>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.assignments.progressTitle', 'Record progress')}</h2>
            <form className="admin-form" onSubmit={handleRecordCompletion}>
              <div className="admin-form__field">
                <label>{t('admin.assignments.completionStatus', 'Status')}</label>
                <select
                  value={completionStatus}
                  onChange={(event) => setCompletionStatus(event.target.value as 'in_progress' | 'completed')}
                >
                  <option value="in_progress">{t('admin.assignments.inProgress', 'In progress')}</option>
                  <option value="completed">{t('admin.assignments.completed', 'Completed')}</option>
                </select>
              </div>
              <div className="admin-form__field">
                <label>{t('admin.assignments.score', 'Score (0–100)')}</label>
                <input value={score} onChange={(event) => setScore(event.target.value)} inputMode="numeric" />
              </div>
              {submitState.status === 'error' ? (
                <p className="admin-form__error" role="alert">
                  {submitState.message}
                </p>
              ) : null}
              <div className="admin-form__actions">
                <button
                  className="admin-btn admin-btn--secondary"
                  type="submit"
                  disabled={submitState.status === 'saving' || !selectedCourse || !userId}
                >
                  {submitState.status === 'saving'
                    ? t('admin.assignments.saving', 'Saving...')
                    : t('admin.assignments.recordProgress', 'Record progress')}
                </button>
              </div>
            </form>
          </article>

          <article className="admin-card">
            <h2>{t('admin.assignments.listTitle', 'Assignments')}</h2>
            {loadState.assignments.length === 0 ? (
              <EmptyState message={t('admin.assignments.empty', 'No assignments found.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.assignments.col.course', 'Course')}</th>
                    <th>{t('admin.assignments.col.learner', 'Learner')}</th>
                    <th>{t('admin.assignments.col.status', 'Status')}</th>
                    <th>{t('admin.assignments.col.dueAt', 'Due date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadState.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{findCourseTitle(loadState.courses, assignment.courseId)}</td>
                      <td>
                        {findUserLabel(
                          loadState.users,
                          assignment.userId,
                          t('admin.assignments.groupAssignment', 'Group'),
                        )}
                      </td>
                      <td>
                        <select
                          className="admin-status-select"
                          value={assignment.status}
                          onChange={(event) => void handleUpdateAssignmentStatus(assignment.id, event.target.value)}
                        >
                          {ASSIGNMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {assignment.dueAt
                          ? new Date(assignment.dueAt).toLocaleDateString()
                          : t('admin.assignments.noDueDate', '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.assignments.progressListTitle', 'Course progress')}</h2>
            {loadState.progressItems.length === 0 ? (
              <EmptyState message={t('admin.assignments.progressEmpty', 'No course progress found.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.assignments.col.course', 'Course')}</th>
                    <th>{t('admin.assignments.col.learner', 'Learner')}</th>
                    <th>{t('admin.assignments.col.status', 'Status')}</th>
                    <th>{t('admin.assignments.col.score', 'Score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadState.progressItems.map((progress) => (
                    <tr key={progress.id}>
                      <td>{findCourseTitle(loadState.courses, progress.courseId)}</td>
                      <td>
                        {findUserLabel(loadState.users, progress.userId, t('admin.assignments.groupAssignment', 'Group'))}
                      </td>
                      <td>
                        <StatusBadge>{progress.status}</StatusBadge>
                      </td>
                      <td>{progress.score !== null ? `${progress.score}%` : t('admin.assignments.noScore', '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}

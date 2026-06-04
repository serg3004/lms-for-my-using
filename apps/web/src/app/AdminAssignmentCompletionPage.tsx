import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; status: string };
type User = { id: string; email: string; name: string | null; status: string };
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

function findCourseTitle(courses: Course[], courseId: string) {
  return courses.find((course) => course.id === courseId)?.title ?? courseId;
}

function findUserLabel(users: User[], userId: string | null) {
  if (!userId) {
    return 'Group assignment';
  }

  const user = users.find((item) => item.id === userId);
  return user?.name || user?.email || userId;
}

export function AdminAssignmentCompletionPage() {
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
      const selectedCourseId = nextCourseId || courseId || courses[0]?.id || '';

      setCourseId(selectedCourseId);
      setUserId((current) => current || users[0]?.id || '');
      setLoadState({ status: 'loaded', courses, users, assignments, progressItems });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? 'Your session expired. Sign in again.'
          : 'Unable to load assignment management data.';
      setLoadState({ status: 'error', message });
    }
  }, [courseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((course) => course.id === courseId) : undefined;
  }, [courseId, loadState]);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
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
          ? 'This course is already assigned to the selected learner.'
          : 'Unable to create assignment.';
      setSubmitState({ status: 'error', message });
    }
  }

  async function recordCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse || !userId) {
      return;
    }

    const scoreValue = score.trim() ? Number(score) : undefined;

    if (scoreValue !== undefined && (!Number.isInteger(scoreValue) || scoreValue < 0 || scoreValue > 100)) {
      setSubmitState({ status: 'error', message: 'Score must be an integer from 0 to 100.' });
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
      setSubmitState({ status: 'error', message: 'Unable to record course completion progress.' });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message="Loading assignment management..." variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title="Course assignment management" message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin">
          Admin
        </a>
        <nav className="admin-nav">
          <a className="admin-nav-link" href="/admin/courses">
            Course builder
          </a>
          <a className="admin-nav-link" href="/admin/assignments" aria-current="page">
            Assignments
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>Course assignment management</h1>
            <p>Assign courses and record learner course completion progress.</p>
          </div>
          <a href="/admin">Back to dashboard</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>Create assignment</h2>
            {loadState.courses.length === 0 || loadState.users.length === 0 ? (
              <EmptyState message="Create at least one course and user before assigning courses." />
            ) : (
              <form onSubmit={createAssignment}>
                <label>
                  Course
                  <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Learner
                  <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                    {loadState.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="date" />
                </label>
                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving' ? 'Saving...' : 'Assign course'}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>Completion rules</h2>
            <p>
              MVP completion is recorded through progress status. Mark the learner as completed only after required lessons
              and assessment conditions are satisfied outside this screen.
            </p>
            <form onSubmit={recordCompletion}>
              <label>
                Completion status
                <select value={completionStatus} onChange={(event) => setCompletionStatus(event.target.value as 'in_progress' | 'completed')}>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                Score
                <input value={score} onChange={(event) => setScore(event.target.value)} inputMode="numeric" />
              </label>
              <button type="submit" disabled={submitState.status === 'saving' || !selectedCourse || !userId}>
                Record progress
              </button>
            </form>
          </article>

          <article className="admin-card">
            <h2>Assignments</h2>
            {loadState.assignments.length === 0 ? (
              <EmptyState message="No assignments found." />
            ) : (
              <table>
                <tbody>
                  {loadState.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{findCourseTitle(loadState.courses, assignment.courseId)}</td>
                      <td>{findUserLabel(loadState.users, assignment.userId)}</td>
                      <td>
                        <StatusBadge>{assignment.status}</StatusBadge>
                      </td>
                      <td>{assignment.dueAt ? new Date(assignment.dueAt).toLocaleDateString() : 'No due date'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="admin-card">
            <h2>Course progress</h2>
            {loadState.progressItems.length === 0 ? (
              <EmptyState message="No course progress found." />
            ) : (
              <table>
                <tbody>
                  {loadState.progressItems.map((progress) => (
                    <tr key={progress.id}>
                      <td>{findCourseTitle(loadState.courses, progress.courseId)}</td>
                      <td>{findUserLabel(loadState.users, progress.userId)}</td>
                      <td>
                        <StatusBadge>{progress.status}</StatusBadge>
                      </td>
                      <td>{progress.score ?? 'No score'}</td>
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

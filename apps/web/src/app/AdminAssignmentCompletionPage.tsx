import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { clearFieldError, type FormValidationErrors } from '../shared/formValidation.js';
import { DataTable, EmptyState, PageState, StatusBadge, type Column } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';

type Course = { id: string; organizationId: string; title: string; status: string };
type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
};
type Group = { id: string; organizationId: string; name: string; status: string };
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
  | { status: 'loaded'; courses: Course[]; users: User[]; groups: Group[]; assignments: Assignment[]; progressItems: Progress[] }
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

function findGroupLabel(groups: Group[], groupId: string | null, fallback: string) {
  if (!groupId) return fallback;
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : groupId;
}

export function AdminAssignmentCompletionPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [courseId, setCourseId] = useState('');
  const [assignTo, setAssignTo] = useState<'user' | 'group'>('user');
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [completionStatus, setCompletionStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [score, setScore] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [recordErrors, setRecordErrors] = useState<FormValidationErrors<'score'>>({});

  const navItems: AdminNavItem[] = [
    { label: t('admin.assignments.title', 'Assignments'), href: '/admin/assignments', isCurrent: true },
  ];

  const loadData = useCallback(async (nextCourseId?: string) => {
    try {
      const [{ items: courses }, { items: users }, groups, { items: assignments }, { items: progressItems }] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
        apiRequest<PaginatedResponse<User>>('/users?pageSize=200'),
        apiRequest<Group[]>('/groups'),
        apiRequest<PaginatedResponse<Assignment>>('/assignments?pageSize=200'),
        apiRequest<PaginatedResponse<Progress>>('/progress?pageSize=200'),
      ]);
      const selectedCourseId = nextCourseId ?? (courseId || courses[0]?.id || '');

      setCourseId(selectedCourseId);
      setUserId((current) => current || users[0]?.id || '');
      setGroupId((current) => current || groups[0]?.id || '');
      setLoadState({ status: 'loaded', courses, users, groups, assignments, progressItems });
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

    if (loadState.status !== 'loaded' || !selectedCourse) return;
    if (assignTo === 'user' && !userId) return;
    if (assignTo === 'group' && !groupId) return;

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Assignment>('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          ...(assignTo === 'user' ? { userId } : { groupId }),
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
      setRecordErrors({ score: t('admin.assignments.invalidScore', 'Score must be an integer from 0 to 100.') });
      return;
    }
    setRecordErrors({});

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
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.assignments.title', 'Assignments')}
        subtitle={t('admin.assignments.subtitle', 'Assign courses to learners and track completion.')}
      />

      <section className="admin-content-grid">
        <AdminCard>
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
              <FormField id="assign-create-course" label={t('admin.assignments.course', 'Course')}>
                <select id="assign-create-course" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  {loadState.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="assign-create-assign-to" label={t('admin.assignments.assignTo', 'Assign to')}>
                <select id="assign-create-assign-to" value={assignTo} onChange={(event) => setAssignTo(event.target.value as 'user' | 'group')}>
                  <option value="user">{t('admin.assignments.assignToUser', 'User')}</option>
                  <option value="group">{t('admin.assignments.assignToGroup', 'Group')}</option>
                </select>
              </FormField>
              {assignTo === 'user' ? (
                <FormField id="assign-create-user" label={t('admin.assignments.learner', 'Learner')}>
                  <select id="assign-create-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
                    {loadState.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getUserLabel(user)}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <FormField id="assign-create-group" label={t('admin.assignments.group', 'Group')}>
                  {loadState.groups.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {t('admin.assignments.noGroups', 'No groups found. Create a group first.')}
                    </p>
                  ) : (
                    <select id="assign-create-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                      {loadState.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              )}
              <FormField id="assign-create-due-at" label={t('admin.assignments.dueAt', 'Due date')}>
                <input id="assign-create-due-at" value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="date" />
              </FormField>
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
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.assignments.progressTitle', 'Record progress')}</h2>
          <form className="admin-form" onSubmit={handleRecordCompletion}>
            <FormField id="record-status" label={t('admin.assignments.completionStatus', 'Status')}>
              <select
                id="record-status"
                value={completionStatus}
                onChange={(event) => setCompletionStatus(event.target.value as 'in_progress' | 'completed')}
              >
                <option value="in_progress">{t('admin.assignments.inProgress', 'In progress')}</option>
                <option value="completed">{t('admin.assignments.completed', 'Completed')}</option>
              </select>
            </FormField>
            <FormField id="record-score" label={t('admin.assignments.score', 'Score (0–100)')} error={recordErrors.score}>
              <input
                id="record-score"
                aria-describedby={recordErrors.score ? 'record-score-error' : undefined}
                aria-invalid={Boolean(recordErrors.score)}
                value={score}
                onChange={(event) => { setScore(event.target.value); setRecordErrors((prev) => clearFieldError(prev, 'score')); }}
                inputMode="numeric"
              />
            </FormField>
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
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.assignments.listTitle', 'Assignments')}</h2>
          <DataTable<Assignment>
            columns={[
              { key: 'course', label: t('admin.assignments.col.course', 'Course'), render: (a) => findCourseTitle(loadState.courses, a.courseId) },
              { key: 'learner', label: t('admin.assignments.col.learner', 'Learner'), render: (a) => a.userId
                ? findUserLabel(loadState.users, a.userId, a.userId)
                : findGroupLabel(loadState.groups, a.groupId, t('admin.assignments.groupAssignment', 'Group')) },
              { key: 'status', label: t('admin.assignments.col.status', 'Status'), render: (a) => (
                <select
                  className="admin-status-select"
                  value={a.status}
                  onChange={(event) => void handleUpdateAssignmentStatus(a.id, event.target.value)}
                >
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )},
              { key: 'dueAt', label: t('admin.assignments.col.dueAt', 'Due date'), render: (a) => a.dueAt
                ? new Date(a.dueAt).toLocaleDateString()
                : t('admin.assignments.noDueDate', '—') },
            ] satisfies Column<Assignment>[]}
            rows={loadState.assignments}
            keyExtractor={(a) => a.id}
            emptyMessage={t('admin.assignments.empty', 'No assignments found.')}
          />
        </AdminCard>

        <AdminCard>
          <h2>{t('admin.assignments.progressListTitle', 'Course progress')}</h2>
          <DataTable<Progress>
            columns={[
              { key: 'course', label: t('admin.assignments.col.course', 'Course'), render: (p) => findCourseTitle(loadState.courses, p.courseId) },
              { key: 'learner', label: t('admin.assignments.col.learner', 'Learner'), render: (p) => findUserLabel(loadState.users, p.userId, t('admin.assignments.groupAssignment', 'Group')) },
              { key: 'status', label: t('admin.assignments.col.status', 'Status'), render: (p) => <StatusBadge>{p.status}</StatusBadge> },
              { key: 'score', label: t('admin.assignments.col.score', 'Score'), render: (p) => p.score !== null ? `${p.score}%` : t('admin.assignments.noScore', '—') },
            ] satisfies Column<Progress>[]}
            rows={loadState.progressItems}
            keyExtractor={(p) => p.id}
            emptyMessage={t('admin.assignments.progressEmpty', 'No course progress found.')}
          />
        </AdminCard>
      </section>
    </AdminPageLayout>
  );
}

import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../shared/formatDate.js';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { listDepartments } from '../shared/api/departments.js';
import { clearFieldError, type FormValidationErrors } from '../shared/formValidation.js';
import { Button, DataTable, EmptyState, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  ASSIGNMENT_STATUSES,
  computeAssignmentStats,
  findCourseTitle,
  findDepartmentLabel,
  findGroupLabel,
  findUserLabel,
  getUserLabel,
  type Assignment,
  type AssignmentStatus,
  type Course,
  type Department,
  type Group,
  type Progress,
  type User,
} from './admin-assignments/model.js';

type AdminAssignmentCompletionData = {
  courses: Course[];
  users: User[];
  groups: Group[];
  departments: Department[];
  assignments: Assignment[];
  progressItems: Progress[];
};

export function AdminAssignmentCompletionPage() {
  const { t } = useTranslation();
  const [courseId, setCourseId] = useState('');
  const [assignTo, setAssignTo] = useState<'user' | 'group' | 'department'>('user');
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [completionStatus, setCompletionStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [score, setScore] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [recordErrors, setRecordErrors] = useState<FormValidationErrors<'score'>>({});
  const assignDialogRef = useRef<HTMLDialogElement>(null);
  const progressDialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.assignments.title', 'Assignments'), href: '/admin/assignments', isCurrent: true },
  ];

  const assignmentStatusLabels: Record<AssignmentStatus, string> = {
    assigned: t('admin.assignments.status.assigned', 'Assigned'),
    completed: t('admin.assignments.completed', 'Completed'),
    cancelled: t('admin.assignments.status.cancelled', 'Cancelled'),
  };

  const pendingCourseIdRef = useRef<string | undefined>(undefined);

  const { state: loadState, reload: loadData, mutate } = useAsyncData<AdminAssignmentCompletionData>(
    async () => {
      const [{ items: courses }, { items: users }, groups, { items: departments }, { items: assignments }, { items: progressItems }] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
        apiRequest<PaginatedResponse<User>>('/users?pageSize=200'),
        apiRequest<Group[]>('/groups'),
        listDepartments({ status: 'active', pageSize: 200 }),
        apiRequest<PaginatedResponse<Assignment>>('/assignments?pageSize=200'),
        apiRequest<PaginatedResponse<Progress>>('/progress?pageSize=200'),
      ]);
      const selectedCourseId = pendingCourseIdRef.current ?? (courseId || courses[0]?.id || '');
      pendingCourseIdRef.current = undefined;

      setCourseId(selectedCourseId);
      setUserId((current) => current || users[0]?.id || '');
      setGroupId((current) => current || groups[0]?.id || '');
      setDepartmentId((current) => current || departments[0]?.id || '');
      return { courses, users, groups, departments, assignments, progressItems };
    },
    [t],
    {
      unauthenticated: t('admin.assignments.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.assignments.loadError', 'Unable to load assignment management data.'),
    },
  );

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.data.courses.find((c) => c.id === courseId) : undefined;
  }, [courseId, loadState]);

  function openAssignDialog() {
    setSubmitState({ status: 'idle' });
    assignDialogRef.current?.showModal();
  }

  function openProgressDialog() {
    setSubmitState({ status: 'idle' });
    setRecordErrors({});
    progressDialogRef.current?.showModal();
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse) return;
    if (assignTo === 'user' && !userId) return;
    if (assignTo === 'group' && !groupId) return;
    if (assignTo === 'department' && !departmentId) return;

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Assignment>('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          ...(assignTo === 'user'
            ? { userId }
            : assignTo === 'group'
              ? { groupId }
              : { departmentId, includeDescendants }),
          status: 'assigned',
          dueAt: dueAt || undefined,
        }),
      });
      setDueAt('');
      setSubmitState({ status: 'idle' });
      assignDialogRef.current?.close();
      await loadData();
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
      mutate((data) => ({ ...data, assignments: data.assignments.map((a) => (a.id === assignmentId ? updated : a)) }));
    } catch {
      await loadData();
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
      progressDialogRef.current?.close();
      await loadData();
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

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.assignments.title', 'Assignments')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const stats = computeAssignmentStats(loadState.data.assignments, Date.now());

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.assignments.eyebrow', 'Required learning')}
        title={t('admin.assignments.title', 'Assignments')}
        subtitle={t('admin.assignments.subtitle', 'Assign courses to learners and track completion.')}
        action={
          <div className="admin-header-actions">
            <Button
              variant="primary"
              type="button"
              onClick={openAssignDialog}
              disabled={loadState.data.courses.length === 0 || loadState.data.users.length === 0}
            >
              + {t('admin.assignments.create', 'Assign course')}
            </Button>
            <Button variant="secondary" type="button" onClick={openProgressDialog} disabled={!selectedCourse || !userId}>
              {t('admin.assignments.recordProgress', 'Record progress')}
            </Button>
          </div>
        }
      />

      <StatsGrid>
        <StatCard label={t('admin.assignments.stats.active', 'Active assignments')} value={stats.active} />
        <StatCard label={t('admin.assignments.stats.dueWeek', 'Due this week')} value={stats.dueThisWeek} />
        <StatCard label={t('admin.assignments.stats.overdue', 'Overdue')} value={stats.overdue} />
        <StatCard label={t('admin.assignments.stats.completed', 'Completed total')} value={stats.completed} />
      </StatsGrid>

      <AdminCard>
        <h2>{t('admin.assignments.listTitle', 'Assignments')}</h2>
        <DataTable<Assignment>
          label={t('admin.assignments.listTitle', 'Assignments')}
          columns={[
            { key: 'course', label: t('admin.assignments.col.course', 'Course'), render: (a) => findCourseTitle(loadState.data.courses, a.courseId) },
            { key: 'learner', label: t('admin.assignments.col.learner', 'Learner'), render: (a) => a.userId
              ? findUserLabel(loadState.data.users, a.userId, a.userId)
              : a.groupId
                ? findGroupLabel(loadState.data.groups, a.groupId, t('admin.assignments.groupAssignment', 'Group'))
                : `${findDepartmentLabel(loadState.data.departments, a.departmentId ?? null, t('admin.assignments.departmentAssignment', 'Department'))}${a.includeDescendants ? ` (${t('admin.assignments.includeDescendantsShort', '+ sub-departments')})` : ''}` },
            { key: 'dueAt', label: t('admin.assignments.col.dueAt', 'Due date'), render: (a) => a.dueAt
              ? formatDate(a.dueAt)
              : t('admin.assignments.noDueDate', '—') },
            { key: 'status', label: t('admin.assignments.col.status', 'Status'), render: (a) => (
              <select
                className="admin-status-select"
                value={a.status}
                onChange={(event) => void handleUpdateAssignmentStatus(a.id, event.target.value)}
              >
                {ASSIGNMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{assignmentStatusLabels[s]}</option>
                ))}
              </select>
            )},
          ] satisfies Column<Assignment>[]}
          rows={loadState.data.assignments}
          keyExtractor={(a) => a.id}
          emptyMessage={t('admin.assignments.empty', 'No assignments found.')}
        />
      </AdminCard>

      <AdminCard>
        <h2>{t('admin.assignments.progressListTitle', 'Course progress')}</h2>
        <DataTable<Progress>
          label={t('admin.assignments.progressListTitle', 'Course progress')}
          columns={[
            { key: 'course', label: t('admin.assignments.col.course', 'Course'), render: (p) => findCourseTitle(loadState.data.courses, p.courseId) },
            { key: 'learner', label: t('admin.assignments.col.learner', 'Learner'), render: (p) => findUserLabel(loadState.data.users, p.userId, t('admin.assignments.groupAssignment', 'Group')) },
            { key: 'status', label: t('admin.assignments.col.status', 'Status'), render: (p) => (
              p.status === 'completed'
                ? t('admin.assignments.completed', 'Completed')
                : t('admin.assignments.inProgress', 'In progress')
            )},
            { key: 'score', label: t('admin.assignments.col.score', 'Score'), render: (p) => p.score !== null ? `${p.score}%` : t('admin.assignments.noScore', '—') },
          ] satisfies Column<Progress>[]}
          rows={loadState.data.progressItems}
          keyExtractor={(p) => p.id}
          emptyMessage={t('admin.assignments.progressEmpty', 'No course progress found.')}
        />
      </AdminCard>

      <dialog ref={assignDialogRef} className="admin-dialog">
        <header className="admin-dialog__header">
          <h2>{t('admin.assignments.createTitle', 'Assign course')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.assignments.close', 'Close')} onClick={() => assignDialogRef.current?.close()}>×</button>
        </header>
        {loadState.data.courses.length === 0 || loadState.data.users.length === 0 ? (
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
                {loadState.data.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="assign-create-assign-to" label={t('admin.assignments.assignTo', 'Assign to')}>
              <select id="assign-create-assign-to" value={assignTo} onChange={(event) => setAssignTo(event.target.value as 'user' | 'group' | 'department')}>
                <option value="user">{t('admin.assignments.assignToUser', 'User')}</option>
                <option value="group">{t('admin.assignments.assignToGroup', 'Group')}</option>
                <option value="department">{t('admin.assignments.assignToDepartment', 'Department')}</option>
              </select>
            </FormField>
            {assignTo === 'user' ? (
              <FormField id="assign-create-user" label={t('admin.assignments.learner', 'Learner')}>
                <select id="assign-create-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
                  {loadState.data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserLabel(user)}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : assignTo === 'group' ? (
              <FormField id="assign-create-group" label={t('admin.assignments.group', 'Group')}>
                {loadState.data.groups.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {t('admin.assignments.noGroups', 'No groups found. Create a group first.')}
                  </p>
                ) : (
                  <select id="assign-create-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                    {loadState.data.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            ) : (
              <>
                <FormField id="assign-create-department" label={t('admin.assignments.department', 'Department')}>
                  {loadState.data.departments.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {t('admin.assignments.noDepartments', 'No departments found. Create a department first.')}
                    </p>
                  ) : (
                    <select id="assign-create-department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                      {loadState.data.departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <label>
                  <input
                    type="checkbox"
                    checked={includeDescendants}
                    onChange={(event) => setIncludeDescendants(event.target.checked)}
                  />
                  {' '}{t('admin.assignments.includeDescendants', 'Include sub-departments')}
                </label>
              </>
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
              <button className="admin-btn admin-btn--secondary" type="button" onClick={() => assignDialogRef.current?.close()}>
                {t('admin.assignments.cancel', 'Cancel')}
              </button>
              <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
                {submitState.status === 'saving'
                  ? t('admin.assignments.saving', 'Saving...')
                  : t('admin.assignments.create', 'Assign course')}
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog ref={progressDialogRef} className="admin-dialog">
        <header className="admin-dialog__header">
          <h2>{t('admin.assignments.progressTitle', 'Record progress')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.assignments.close', 'Close')} onClick={() => progressDialogRef.current?.close()}>×</button>
        </header>
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
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => progressDialogRef.current?.close()}>
              {t('admin.assignments.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={submitState.status === 'saving' || !selectedCourse || !userId}
            >
              {submitState.status === 'saving'
                ? t('admin.assignments.saving', 'Saving...')
                : t('admin.assignments.recordProgress', 'Record progress')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}

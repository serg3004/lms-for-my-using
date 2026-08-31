import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { listCourses } from '../shared/api/courses.js';
import {
  archivePositionCourse,
  createPositionCourse,
  listPositionCourses,
  restorePositionCourse,
  updatePositionCourse,
  type PositionCourse,
  type PositionCourseRequirement,
} from '../shared/api/position-courses.js';
import { listPositions, type Position } from '../shared/api/positions.js';
import { useSession } from '../shared/session.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Button, DataTable, EmptyState, PageState, type Column } from '../shared/ui.js';
import type { CourseSummary } from '../shared/api/types.js';

type AdminPositionCoursesData = { positionCourses: PositionCourse[]; positions: Position[]; courses: CourseSummary[] };

type CreateFormState = { positionId: string; courseId: string; requirement: PositionCourseRequirement; dueDays: string };
const EMPTY_CREATE_FORM: CreateFormState = { positionId: '', courseId: '', requirement: 'REQUIRED', dueDays: '' };

export function AdminPositionCoursesPage() {
  const { t } = useTranslation();
  const { currentUser } = useSession();

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createState, setCreateState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });

  const { state: loadState, reload: load } = useAsyncData<AdminPositionCoursesData>(
    async () => {
      const [positionCourses, { items: positions }, { items: courses }] = await Promise.all([
        listPositionCourses(),
        listPositions({ status: 'active', pageSize: 200 }),
        listCourses({ pageSize: 200 }),
      ]);
      return { positionCourses, positions, courses };
    },
    [],
    {
      unauthenticated: t('admin.positionCourses.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.positionCourses.loadError', 'Unable to load position course requirements.'),
    },
  );

  function positionTitle(positions: Position[], positionId: string) {
    return positions.find((position) => position.id === positionId)?.title ?? positionId;
  }

  function courseTitle(courses: CourseSummary[], courseId: string) {
    return courses.find((course) => course.id === courseId)?.title ?? courseId;
  }

  function openCreateDialog() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateState({ status: 'idle' });
    createDialogRef.current?.showModal();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== 'loaded' || !currentUser) return;
    if (!createForm.positionId || !createForm.courseId) return;

    setCreateState({ status: 'saving' });
    try {
      await createPositionCourse({
        organizationId: currentUser.organizationId,
        positionId: createForm.positionId,
        courseId: createForm.courseId,
        requirement: createForm.requirement,
        dueDays: createForm.dueDays.trim() ? Number(createForm.dueDays) : undefined,
      });
      createDialogRef.current?.close();
      await load();
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : undefined;
      const message =
        status === 409
          ? t('admin.positionCourses.duplicate', 'This position already has a requirement for this course.')
          : t('admin.positionCourses.saveError', 'Unable to save the requirement.');
      setCreateState({ status: 'error', message });
    }
  }

  async function handleToggleRequirement(positionCourse: PositionCourse) {
    await updatePositionCourse(positionCourse.id, {
      requirement: positionCourse.requirement === 'REQUIRED' ? 'OPTIONAL' : 'REQUIRED',
    });
    await load();
  }

  async function handleArchive(positionCourse: PositionCourse) {
    await archivePositionCourse(positionCourse.id);
    await load();
  }

  async function handleRestore(positionCourse: PositionCourse) {
    await restorePositionCourse(positionCourse.id);
    await load();
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.positionCourses.loading', 'Loading position course requirements...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.positionCourses.title', 'Position course requirements')}
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
        <PageState title={t('admin.positionCourses.title', 'Position course requirements')} message={loadState.message} variant="error" />
      </main>
    );
  }

  const { positionCourses, positions, courses } = loadState.data;

  const navItems: AdminNavItem[] = [
    { label: t('admin.positionCourses.title', 'Position course requirements'), href: '/admin/position-courses', isCurrent: true },
  ];

  return (
    <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')} navItems={navItems}>
      <AdminPageHeader
        eyebrow={t('admin.positionCourses.eyebrow', 'Organization structure')}
        title={t('admin.positionCourses.title', 'Position course requirements')}
        subtitle={t('admin.positionCourses.subtitle', 'Courses required or recommended for each position, resolved automatically for anyone holding it.')}
        action={
          <Button variant="primary" type="button" onClick={openCreateDialog}>
            + {t('admin.positionCourses.add', 'Add requirement')}
          </Button>
        }
      />

      {positionCourses.length === 0 ? (
        <EmptyState message={t('admin.positionCourses.empty', 'No position course requirements found.')} />
      ) : (
        <DataTable<PositionCourse>
          label={t('admin.positionCourses.title', 'Position course requirements')}
          columns={[
            { key: 'position', label: t('admin.positionCourses.colPosition', 'Position'), render: (pc) => positionTitle(positions, pc.positionId) },
            { key: 'course', label: t('admin.positionCourses.colCourse', 'Course'), render: (pc) => courseTitle(courses, pc.courseId) },
            {
              key: 'requirement',
              label: t('admin.positionCourses.colRequirement', 'Requirement'),
              render: (pc) =>
                pc.requirement === 'REQUIRED'
                  ? t('admin.positionCourses.required', 'Required')
                  : t('admin.positionCourses.optional', 'Optional'),
            },
            {
              key: 'dueDays',
              label: t('admin.positionCourses.colDueDays', 'Due (days)'),
              render: (pc) => pc.dueDays ?? t('admin.positionCourses.noDueDays', '—'),
            },
            {
              key: 'status',
              label: t('admin.positionCourses.colStatus', 'Status'),
              render: (pc) =>
                pc.status === 'archived'
                  ? t('admin.positionCourses.statusArchived', 'Archived')
                  : t('admin.positionCourses.statusActive', 'Active'),
            },
            {
              key: 'actions',
              label: '',
              render: (pc) => (
                <span className="admin-table-actions">
                  <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleToggleRequirement(pc)}>
                    {pc.requirement === 'REQUIRED'
                      ? t('admin.positionCourses.makeOptional', 'Make optional')
                      : t('admin.positionCourses.makeRequired', 'Make required')}
                  </button>
                  {pc.status === 'active' ? (
                    <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleArchive(pc)}>
                      {t('admin.positionCourses.archive', 'Archive')}
                    </button>
                  ) : (
                    <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void handleRestore(pc)}>
                      {t('admin.positionCourses.restore', 'Restore')}
                    </button>
                  )}
                </span>
              ),
            },
          ] satisfies Column<PositionCourse>[]}
          rows={positionCourses}
          keyExtractor={(pc) => pc.id}
          emptyMessage={t('admin.positionCourses.empty', 'No position course requirements found.')}
        />
      )}

      <dialog ref={createDialogRef} className="admin-dialog" onClose={() => createDialogRef.current?.close()}>
        <header className="admin-dialog__header">
          <h2>{t('admin.positionCourses.createDialogTitle', 'Add requirement')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('admin.positionCourses.close', 'Close')} onClick={() => createDialogRef.current?.close()}>
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleCreate}>
          <FormField id="position-course-create-position" label={t('admin.positionCourses.fieldPosition', 'Position')} required>
            <select
              id="position-course-create-position"
              value={createForm.positionId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, positionId: e.target.value }))}
            >
              <option value="">{t('admin.positionCourses.selectPosition', 'Select a position…')}</option>
              {positions.map((position) => (
                <option value={position.id} key={position.id}>{position.title}</option>
              ))}
            </select>
          </FormField>
          <FormField id="position-course-create-course" label={t('admin.positionCourses.fieldCourse', 'Course')} required>
            <select
              id="position-course-create-course"
              value={createForm.courseId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, courseId: e.target.value }))}
            >
              <option value="">{t('admin.positionCourses.selectCourse', 'Select a course…')}</option>
              {courses.map((course) => (
                <option value={course.id} key={course.id}>{course.title}</option>
              ))}
            </select>
          </FormField>
          <FormField id="position-course-create-requirement" label={t('admin.positionCourses.fieldRequirement', 'Requirement')}>
            <select
              id="position-course-create-requirement"
              value={createForm.requirement}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, requirement: e.target.value as PositionCourseRequirement }))}
            >
              <option value="REQUIRED">{t('admin.positionCourses.required', 'Required')}</option>
              <option value="OPTIONAL">{t('admin.positionCourses.optional', 'Optional')}</option>
            </select>
          </FormField>
          <FormField
            id="position-course-create-due-days"
            label={t('admin.positionCourses.fieldDueDays', 'Due days (from taking the position)')}
            hint={t('admin.positionCourses.fieldDueDaysHint', 'Optional, 0–3650')}
          >
            <input
              id="position-course-create-due-days"
              type="number"
              min={0}
              max={3650}
              value={createForm.dueDays}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, dueDays: e.target.value }))}
            />
          </FormField>
          {createState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{createState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => createDialogRef.current?.close()}>
              {t('admin.positionCourses.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={createState.status === 'saving'}>
              {createState.status === 'saving' ? t('admin.positionCourses.saving', 'Saving...') : t('admin.positionCourses.create', 'Create')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}

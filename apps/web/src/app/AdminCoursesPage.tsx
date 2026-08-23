import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, DataTable, Pagination, PageState, SearchInput, SectionHeader, StatCard, StatsGrid, Toolbar, type Column } from '../shared/ui.js';
import type { PaginatedResponse, UserSummary } from '../shared/api/types.js';
import { apiRequest } from '../shared/apiClient.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  addCourseInstructor,
  createCourse,
  deleteCourse,
  listCourseInstructors,
  listCourses,
  removeCourseInstructor,
  type CourseInstructor,
} from '../shared/api/courses.js';
import { formatUserName, usersAvailableToAdd } from './admin-courses/model.js';

type CourseStatus = 'draft' | 'published' | 'archived';

type AdminCourseSummary = {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
  _count: { lessons: number };
};

type AdminCoursesData = { courses: AdminCourseSummary[]; currentUser: CurrentUser; total: number; pageSize: number };

type CreateFormState = { status: 'idle' } | { status: 'submitting' } | { status: 'error'; message: string };

function slugifyTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function statusToBadgeVariant(status: CourseStatus) {
  if (status === 'published') return 'published' as const;
  if (status === 'archived') return 'neutral' as const;
  return 'draft' as const;
}

function formatRelativeDate(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return '1 день назад';
  if (days < 7) return `${days} дн. назад`;
  if (days < 14) return '1 нед. назад';
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  return new Date(value).toLocaleDateString();
}

export function AdminCoursesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formState, setFormState] = useState<CreateFormState>({ status: 'idle' });
  const [createErrors, setCreateErrors] = useState<FormValidationErrors<'title'>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CourseStatus>('all');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const instructorsDialogRef = useRef<HTMLDialogElement>(null);
  const [instructorsCourse, setInstructorsCourse] = useState<AdminCourseSummary | null>(null);
  const [orgUsers, setOrgUsers] = useState<UserSummary[]>([]);
  const [courseInstructors, setCourseInstructors] = useState<CourseInstructor[]>([]);
  const [instructorsState, setInstructorsState] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [addInstructorId, setAddInstructorId] = useState('');

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin'), href: '/admin' },
    { label: t('admin.courses.title', 'Courses'), href: '/admin/courses', isCurrent: true },
  ];

  const { state: pageState, reload: loadData } = useAsyncData<AdminCoursesData>(
    async () => {
      const [result, currentUser] = await Promise.all([
        listCourses({ page, pageSize: 20 }) as Promise<PaginatedResponse<AdminCourseSummary>>,
        getCurrentUser(),
      ]);
      return { courses: result.items, currentUser, total: result.total, pageSize: result.pageSize };
    },
    [page, t],
    {
      unauthenticated: t('admin.courses.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.courses.loadError', 'Unable to load courses. Try again later.'),
    },
  );

  useEffect(() => {
    if (showCreate) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [showCreate]);

  function openCreate() {
    setFormTitle('');
    setFormDescription('');
    setFormState({ status: 'idle' });
    setCreateErrors({});
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (pageState.status !== 'loaded') return;

    const title = formTitle.trim();
    const nextErrors = validateRequiredFields([
      { name: 'title', value: title, message: t('admin.courses.titleRequired', 'Course title is required') },
    ]);
    setCreateErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;

    const slug = slugifyTitle(title);
    if (!slug) {
      setCreateErrors({ title: t('admin.courses.invalidTitle', 'Enter a title using letters or numbers.') });
      return;
    }

    setFormState({ status: 'submitting' });
    try {
      await createCourse({
        organizationId: pageState.data.currentUser.organizationId,
        title,
        slug,
        description: formDescription.trim() || undefined,
        status: 'draft',
      });
      setShowCreate(false);
      void loadData();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.courses.courseExists', 'A course with this title already exists.')
          : error instanceof ApiClientError
            ? error.message
            : t('admin.courses.saveError', 'Failed to create course. Try again.');
      setFormState({ status: 'error', message });
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteCourse(deletingId);
      setDeletingId(null);
      void loadData();
    } catch {
      setDeletingId(null);
    }
  }

  async function openInstructorsDialog(course: AdminCourseSummary) {
    setInstructorsCourse(course);
    setAddInstructorId('');
    setInstructorsState({ status: 'loading' });
    instructorsDialogRef.current?.showModal();

    try {
      const [users, instructors] = await Promise.all([
        orgUsers.length > 0 ? orgUsers : apiRequest<PaginatedResponse<UserSummary>>('/users?pageSize=200').then((res) => res.items),
        listCourseInstructors(course.id),
      ]);
      setOrgUsers(users);
      setCourseInstructors(instructors);
      setInstructorsState({ status: 'idle' });
    } catch {
      setInstructorsState({
        status: 'error',
        message: t('admin.courses.instructorsLoadError', 'Unable to load course instructors.'),
      });
    }
  }

  function closeInstructorsDialog() {
    instructorsDialogRef.current?.close();
    setInstructorsCourse(null);
  }

  async function handleAddInstructor() {
    if (!instructorsCourse || !addInstructorId) return;
    try {
      const instructors = await addCourseInstructor(instructorsCourse.id, addInstructorId);
      setCourseInstructors(instructors);
      setAddInstructorId('');
    } catch {
      setInstructorsState({ status: 'error', message: t('admin.courses.saveError', 'Failed to create course. Try again.') });
    }
  }

  async function handleRemoveInstructor(instructorId: string) {
    if (!instructorsCourse) return;
    try {
      const instructors = await removeCourseInstructor(instructorsCourse.id, instructorId);
      setCourseInstructors(instructors);
    } catch {
      setInstructorsState({ status: 'error', message: t('admin.courses.saveError', 'Failed to create course. Try again.') });
    }
  }

  if (pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.courses.loading', 'Loading courses...')} variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.courses.title', 'Courses')}
          message={pageState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (pageState.status === 'error' || pageState.status === 'notFound') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.courses.title', 'Courses')} message={pageState.message} variant="error" />
      </main>
    );
  }

  const { courses } = pageState.data;
  const published = courses.filter((c) => c.status === 'published').length;
  const draft = courses.filter((c) => c.status === 'draft').length;
  const archived = courses.filter((c) => c.status === 'archived').length;
  const deletingCourse = courses.find((c) => c.id === deletingId);

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = !search.trim() || course.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const courseColumns: Column<AdminCourseSummary>[] = [
    {
      key: 'course',
      label: t('admin.courses.col.course', 'Course'),
      render: (course) => (
        <>
          <div className="td-title">{course.title}</div>
          {course.description ? (
            <div className="td-meta">{course.description.slice(0, 80)}{course.description.length > 80 ? '…' : ''}</div>
          ) : null}
        </>
      ),
    },
    {
      key: 'status',
      label: t('admin.courses.col.status', 'Status'),
      render: (course) => (
        <Badge variant={statusToBadgeVariant(course.status)}>
          {course.status === 'published' ? t('admin.courses.status.published', 'Published')
            : course.status === 'archived' ? t('admin.courses.status.archived', 'Archived')
            : t('admin.courses.status.draft', 'Draft')}
        </Badge>
      ),
    },
    {
      key: 'lessons',
      label: t('admin.courses.col.lessons', 'Lessons'),
      render: (course) => course._count.lessons,
    },
    {
      key: 'updated',
      label: t('admin.courses.col.updated', 'Updated'),
      render: (course) => (
        <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: '13px' }}>
          {formatRelativeDate(course.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (course) => (
        <div className="td-actions">
          <Button variant="ghost" size="sm" type="button" onClick={() => void openInstructorsDialog(course)}>
            {t('admin.courses.instructors', 'Instructors')}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => window.location.assign(`/admin/courses/${course.id}`)}>
            ✏ {t('common.edit', 'Edit')}
          </Button>
          <Button variant="ghost" size="sm" type="button" style={{ color: 'var(--color-danger)' }} onClick={() => setDeletingId(course.id)}>
            ✕
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.courses.eyebrow', 'Learning content')}
        title={t('admin.courses.title', 'Courses')}
        subtitle={t('admin.courses.subtitle', 'Create and manage courses for your organization.')}
        action={
          <Button variant="primary" onClick={openCreate} type="button">
            + {t('admin.courses.create', 'Create course')}
          </Button>
        }
      />

      <StatsGrid>
        <StatCard label={t('admin.courses.stats.total', 'Total courses')} value={courses.length} />
        <StatCard
          label={t('admin.courses.stats.published', 'Published')}
          value={published}
          trend={draft > 0 ? `${draft} в черновике` : undefined}
        />
        <StatCard label={t('admin.courses.stats.draft', 'Draft')} value={draft} />
        <StatCard label={t('admin.courses.stats.archived', 'Archived')} value={archived} />
      </StatsGrid>

      <SectionHeader title={t('admin.courses.title', 'Courses')} />

      <Toolbar
        left={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('admin.courses.searchPlaceholder', 'Search courses...')}
          />
        }
        right={
          <select
            className="admin-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | CourseStatus)}
          >
            <option value="all">{t('admin.courses.allStatuses', 'All statuses')}</option>
            <option value="published">{t('admin.courses.status.published', 'Published')}</option>
            <option value="draft">{t('admin.courses.status.draft', 'Draft')}</option>
            <option value="archived">{t('admin.courses.status.archived', 'Archived')}</option>
          </select>
        }
      />

      <DataTable
        label={t('admin.courses.title', 'Courses')}
        columns={courseColumns}
        rows={filteredCourses}
        keyExtractor={(c) => c.id}
        emptyMessage={t('admin.courses.empty', 'No courses yet. Create your first course.')}
      />

      <Pagination
        page={page}
        pageSize={pageState.data.pageSize}
        total={pageState.data.total}
        onPage={setPage}
      />

      {/* Create course dialog */}
      <dialog className="admin-dialog" ref={dialogRef} onClose={() => setShowCreate(false)}>
        <div className="admin-dialog__header">
          <h2>{t('admin.courses.create', 'Create course')}</h2>
          <button
            className="admin-dialog__close"
            onClick={() => setShowCreate(false)}
            type="button"
            aria-label={t('common.close', 'Close')}
          >
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={(e) => void handleCreate(e)}>
          <FormField
            id="course-title"
            label={t('admin.courses.form.title', 'Course title')}
            required
            error={createErrors.title}
            hint={!createErrors.title && formTitle.trim() ? `slug: ${slugifyTitle(formTitle)}` : undefined}
          >
            <input
              id="course-title"
              aria-describedby={createErrors.title ? 'course-title-error' : undefined}
              aria-invalid={Boolean(createErrors.title)}
              maxLength={160}
              type="text"
              value={formTitle}
              onChange={(e) => {
                setFormTitle(e.target.value);
                setCreateErrors((err) => clearFieldError(err, 'title'));
              }}
            />
          </FormField>

          <FormField id="course-description" label={t('admin.courses.form.description', 'Description')}>
            <textarea
              id="course-description"
              maxLength={1000}
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </FormField>

          {formState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{formState.message}</p>
          ) : null}

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={() => setShowCreate(false)} type="button">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={formState.status === 'submitting'}
              type="submit"
            >
              {formState.status === 'submitting' ? t('common.saving', 'Saving...') : t('admin.courses.create', 'Create course')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={instructorsDialogRef} className="admin-dialog" onClose={closeInstructorsDialog}>
        <div className="admin-dialog__header">
          <h2>
            {instructorsCourse
              ? t('admin.courses.instructorsDialogTitle', 'Instructors: {{title}}', { title: instructorsCourse.title })
              : ''}
          </h2>
          <button className="admin-dialog__close" type="button" aria-label={t('common.close', 'Close')} onClick={closeInstructorsDialog}>
            ✕
          </button>
        </div>
        <div className="admin-form">
          {instructorsState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{instructorsState.message}</p>
          ) : null}

          <section className="admin-membership-section">
            <ul className="admin-membership-list">
              {courseInstructors.length === 0 ? (
                <li className="admin-membership-list__empty">{t('admin.courses.noInstructors', 'No instructors assigned.')}</li>
              ) : (
                courseInstructors.map((instructor) => (
                  <li key={instructor.id}>
                    <span>{formatUserName(instructor)}</span>
                    <button
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      type="button"
                      onClick={() => void handleRemoveInstructor(instructor.id)}
                    >
                      {t('admin.courses.removeInstructor', 'Remove')}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="admin-membership-add">
              <select value={addInstructorId} onChange={(e) => setAddInstructorId(e.target.value)}>
                <option value="">{t('admin.courses.selectInstructor', 'Select a user…')}</option>
                {usersAvailableToAdd(orgUsers, courseInstructors.map((i) => i.id)).map((u) => (
                  <option value={u.id} key={u.id}>{formatUserName(u)}</option>
                ))}
              </select>
              <button
                className="admin-btn admin-btn--sm admin-btn--primary"
                type="button"
                disabled={!addInstructorId}
                onClick={() => void handleAddInstructor()}
              >
                {t('admin.courses.addInstructor', 'Add')}
              </button>
            </div>
          </section>

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={closeInstructorsDialog}>
              {t('common.close', 'Close')}
            </button>
          </div>
        </div>
      </dialog>

      <ConfirmDialog
        open={deletingId !== null}
        title={t('admin.courses.deleteTitle', 'Delete course')}
        message={t('admin.courses.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', {
          title: deletingCourse?.title ?? '',
        })}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingId(null)}
      />
    </AdminPageLayout>
  );
}

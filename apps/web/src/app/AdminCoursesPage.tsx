import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, EmptyState, PageState, SectionHeader, StatCard, StatsGrid, TableWrap } from '../shared/ui.js';
import { createCourse, deleteCourse, listCourses } from '../shared/api/courses.js';
import '../styles/admin.css';
import '../styles/ui.css';

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

type PageLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; courses: AdminCourseSummary[]; currentUser: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

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
  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formState, setFormState] = useState<CreateFormState>({ status: 'idle' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin'), href: '/admin' },
    { label: t('admin.courses.title', 'Courses'), href: '/admin/courses', isCurrent: true },
  ];

  const loadData = useCallback(async () => {
    setPageState({ status: 'loading' });
    try {
      const [courses, currentUser] = await Promise.all([
        listCourses() as Promise<AdminCourseSummary[]>,
        getCurrentUser(),
      ]);
      setPageState({ status: 'loaded', courses, currentUser });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setPageState({
          status: 'unauthenticated',
          message: t('admin.courses.sessionExpired', 'Your session expired. Sign in again.'),
        });
        return;
      }
      setPageState({
        status: 'error',
        message: t('admin.courses.loadError', 'Unable to load courses. Try again later.'),
      });
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (showCreate) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [showCreate]);

  useEffect(() => {
    if (deletingId) deleteDialogRef.current?.showModal();
    else deleteDialogRef.current?.close();
  }, [deletingId]);

  function openCreate() {
    setFormTitle('');
    setFormDescription('');
    setFormState({ status: 'idle' });
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (pageState.status !== 'loaded') return;

    const title = formTitle.trim();
    const slug = slugifyTitle(title);
    if (!slug) {
      setFormState({ status: 'error', message: t('admin.courses.invalidTitle', 'Enter a title using letters or numbers.') });
      return;
    }

    setFormState({ status: 'submitting' });
    try {
      await createCourse({
        organizationId: pageState.currentUser.organizationId,
        title,
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

  if (pageState.status === 'idle' || pageState.status === 'loading') {
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

  if (pageState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.courses.title', 'Courses')} message={pageState.message} variant="error" />
      </main>
    );
  }

  const { courses } = pageState;
  const published = courses.filter((c) => c.status === 'published').length;
  const draft = courses.filter((c) => c.status === 'draft').length;
  const archived = courses.filter((c) => c.status === 'archived').length;
  const deletingCourse = courses.find((c) => c.id === deletingId);

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
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

      <SectionHeader
        title={t('admin.courses.title', 'Courses')}
        actions={
          <Button variant="secondary" size="sm" type="button">
            {t('admin.courses.allStatuses', 'All statuses')} ▾
          </Button>
        }
      />

      <TableWrap>
        {courses.length === 0 ? (
          <div style={{ padding: '24px' }}>
            <EmptyState message={t('admin.courses.empty', 'No courses yet. Create your first course.')} />
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('admin.courses.col.course', 'Course')}</th>
                <th>{t('admin.courses.col.status', 'Status')}</th>
                <th>{t('admin.courses.col.lessons', 'Lessons')}</th>
                <th>{t('admin.courses.col.updated', 'Updated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <div className="td-title">{course.title}</div>
                    {course.description ? (
                      <div className="td-meta">{course.description.slice(0, 80)}{course.description.length > 80 ? '…' : ''}</div>
                    ) : null}
                  </td>
                  <td>
                    <Badge variant={statusToBadgeVariant(course.status)}>
                      {course.status === 'published' ? t('admin.courses.status.published', 'Published')
                        : course.status === 'archived' ? t('admin.courses.status.archived', 'Archived')
                        : t('admin.courses.status.draft', 'Draft')}
                    </Badge>
                  </td>
                  <td>{course._count.lessons}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    {formatRelativeDate(course.updatedAt)}
                  </td>
                  <td>
                    <div className="td-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => window.location.assign(`/admin/courses/${course.id}`)}
                      >
                        ✏ {t('common.edit', 'Edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={() => setDeletingId(course.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableWrap>

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
          <div className="admin-form__field">
            <label htmlFor="course-title">{t('admin.courses.form.title', 'Course title')} *</label>
            <input
              id="course-title"
              required
              maxLength={160}
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            {formTitle.trim() ? (
              <span className="admin-form__hint">slug: <code>{slugifyTitle(formTitle)}</code></span>
            ) : null}
          </div>

          <div className="admin-form__field">
            <label htmlFor="course-description">{t('admin.courses.form.description', 'Description')}</label>
            <textarea
              id="course-description"
              maxLength={1000}
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

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

      {/* Delete confirmation dialog */}
      <dialog className="admin-dialog" ref={deleteDialogRef} onClose={() => setDeletingId(null)}>
        <div className="admin-dialog__header">
          <h2>{t('admin.courses.deleteTitle', 'Delete course')}</h2>
          <button
            className="admin-dialog__close"
            onClick={() => setDeletingId(null)}
            type="button"
            aria-label={t('common.close', 'Close')}
          >
            ✕
          </button>
        </div>
        <div className="admin-form">
          <p style={{ margin: 0, color: 'var(--color-text)' }}>
            {t('admin.courses.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', {
              title: deletingCourse?.title ?? '',
            })}
          </p>
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={() => setDeletingId(null)} type="button">
              {t('common.cancel', 'Cancel')}
            </button>
            <button className="admin-btn admin-btn--danger" onClick={() => void handleDelete()} type="button">
              {t('common.delete', 'Delete')}
            </button>
          </div>
        </div>
      </dialog>
    </AdminPageLayout>
  );
}

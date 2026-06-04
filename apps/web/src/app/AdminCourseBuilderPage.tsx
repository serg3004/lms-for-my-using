import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

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

const COURSE_STATUSES: CourseStatus[] = ['draft', 'published', 'archived'];

function getStatusTone(status: CourseStatus) {
  if (status === 'published') return 'success';
  if (status === 'archived') return 'neutral';

  return 'neutral';
}

function slugifyTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function AdminCourseBuilderPage() {
  const { t } = useTranslation();
  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formState, setFormState] = useState<CreateFormState>({ status: 'idle' });
  const dialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin dashboard'), href: '/admin' },
    { label: t('admin.courseBuilder.title', 'Courses'), href: '/admin/courses', isCurrent: true },
  ];

  async function loadData() {
    setPageState({ status: 'loading' });

    try {
      const [courses, currentUser] = await Promise.all([
        apiRequest<AdminCourseSummary[]>('/courses'),
        getCurrentUser(),
      ]);

      setPageState({ status: 'loaded', courses, currentUser });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setPageState({
          status: 'unauthenticated',
          message: t('admin.courseBuilder.sessionExpired', 'Your session expired. Sign in again.'),
        });

        return;
      }

      setPageState({
        status: 'error',
        message: t('admin.courseBuilder.loadError', 'Unable to load courses. Try again later.'),
      });
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (showCreate) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [showCreate]);

  function openCreate() {
    setFormTitle('');
    setFormDescription('');
    setFormState({ status: 'idle' });
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (pageState.status !== 'loaded') return;

    const title = formTitle.trim();
    const slug = slugifyTitle(title);

    if (!slug) {
      setFormState({
        status: 'error',
        message: t('admin.courseBuilder.invalidTitle', 'Enter a title using letters or numbers.'),
      });

      return;
    }

    setFormState({ status: 'submitting' });

    try {
      await apiRequest<AdminCourseSummary>('/courses', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: pageState.currentUser.organizationId,
          title,
          slug,
          description: formDescription.trim() || undefined,
          status: 'draft',
        }),
      });

      closeCreate();
      void loadData();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.courseBuilder.courseExists', 'A course with this slug already exists.')
          : error instanceof ApiClientError
            ? error.message
            : t('admin.courseBuilder.saveError', 'Failed to create course. Try again.');

      setFormState({ status: 'error', message });
    }
  }

  async function handleStatusChange(course: AdminCourseSummary, newStatus: CourseStatus) {
    if (newStatus === course.status) return;

    try {
      const updated = await apiRequest<AdminCourseSummary>(`/courses/${course.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      if (pageState.status !== 'loaded') return;

      setPageState({
        ...pageState,
        courses: pageState.courses.map((c) => (c.id === updated.id ? updated : c)),
      });
    } catch {
      // Silently ignore — server error will be visible on next refresh
    }
  }

  if (pageState.status === 'idle' || pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.courseBuilder.loading', 'Loading courses...')} variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.courseBuilder.title', 'Courses')}
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
        <PageState title={t('admin.courseBuilder.title', 'Courses')} message={pageState.message} variant="error" />
      </main>
    );
  }

  const { courses } = pageState;

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.courseBuilder.title', 'Courses')}
        subtitle={t('admin.courseBuilder.subtitle', 'Create and manage courses for your organization.')}
        action={
          <button className="admin-btn admin-btn--primary" onClick={openCreate} type="button">
            {t('admin.courseBuilder.create', 'Create course')}
          </button>
        }
      />

      <AdminCard>
        {courses.length === 0 ? (
          <EmptyState message={t('admin.courseBuilder.empty', 'No courses found.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('admin.courseBuilder.titleCol', 'Title')}</th>
                <th>{t('admin.courseBuilder.slugCol', 'Slug')}</th>
                <th>{t('admin.courseBuilder.lessonsCol', 'Lessons')}</th>
                <th>{t('admin.courseBuilder.statusCol', 'Status')}</th>
                <th>{t('admin.courseBuilder.changeStatus', 'Change status')}</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>{course.title}</td>
                  <td>
                    <code>{course.slug}</code>
                  </td>
                  <td>{course._count.lessons}</td>
                  <td>
                    <StatusBadge tone={getStatusTone(course.status)}>{course.status}</StatusBadge>
                  </td>
                  <td>
                    <select
                      className="admin-status-select"
                      value={course.status}
                      onChange={(e) => void handleStatusChange(course, e.target.value as CourseStatus)}
                      aria-label={t('admin.courseBuilder.changeStatusFor', 'Change status for {{title}}', { title: course.title })}
                    >
                      {COURSE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminCard>

      <dialog className="admin-dialog" ref={dialogRef} onClose={closeCreate}>
        <div className="admin-dialog__header">
          <h2>{t('admin.courseBuilder.create', 'Create course')}</h2>
          <button
            className="admin-dialog__close"
            onClick={closeCreate}
            type="button"
            aria-label={t('common.close', 'Close')}
          >
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={(e) => void handleCreate(e)}>
          <div className="admin-form__field">
            <label htmlFor="create-title">{t('admin.courseBuilder.courseTitle', 'Course title')} *</label>
            <input
              id="create-title"
              required
              maxLength={160}
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            {formTitle.trim() && (
              <span className="admin-form__hint">
                slug: <code>{slugifyTitle(formTitle)}</code>
              </span>
            )}
          </div>

          <div className="admin-form__field">
            <label htmlFor="create-description">{t('admin.courseBuilder.description', 'Description')}</label>
            <textarea
              id="create-description"
              maxLength={1000}
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          {formState.status === 'error' && (
            <p className="admin-form__error" role="alert">{formState.message}</p>
          )}

          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" onClick={closeCreate} type="button">
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              disabled={formState.status === 'submitting'}
              type="submit"
            >
              {formState.status === 'submitting'
                ? t('common.saving', 'Saving...')
                : t('admin.courseBuilder.create', 'Create course')}
            </button>
          </div>
        </form>
      </dialog>
    </AdminPageLayout>
  );
}

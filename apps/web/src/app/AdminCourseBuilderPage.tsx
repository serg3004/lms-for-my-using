import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Organization = { id: string; name: string };
type Course = { id: string; title: string; slug: string; description: string | null; status: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; organizations: Organization[]; courses: Course[] }
  | { status: 'error'; message: string };

function slugifyCourseTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function AdminCourseBuilderPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  async function loadCourses() {
    try {
      const [organizations, courses] = await Promise.all([
        apiRequest<Organization[]>('/organizations'),
        apiRequest<Course[]>('/courses'),
      ]);
      setLoadState({ status: 'loaded', organizations, courses });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.courseBuilder.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.courseBuilder.loadError', 'Unable to load course builder.');
      setLoadState({ status: 'error', message });
    }
  }

  useEffect(() => {
    void loadCourses();
  }, [t]);

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || loadState.organizations.length === 0) {
      return;
    }

    const courseTitle = title.trim();
    const slug = slugifyCourseTitle(courseTitle);

    if (!courseTitle || !slug) {
      setSubmitState({
        status: 'error',
        message: t('admin.courseBuilder.invalidTitle', 'Enter a course title using letters or numbers.'),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Course>('/courses', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: loadState.organizations[0].id,
          title: courseTitle,
          slug,
          description: description.trim() || undefined,
          status: 'draft',
        }),
      });
      setTitle('');
      setDescription('');
      setSubmitState({ status: 'idle' });
      await loadCourses();
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.courseBuilder.courseExists', 'A course with this slug already exists.')
          : t('admin.courseBuilder.saveError', 'Unable to create course.');
      setSubmitState({ status: 'error', message });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.courseBuilder.loading', 'Loading course builder...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.courseBuilder.title', 'Course builder')} message={loadState.message} variant="error" />
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
          <a className="admin-nav-link" href="/admin/users">{t('admin.users.title', 'Users')}</a>
          <a className="admin-nav-link" href="/admin/roles">{t('admin.roles.title', 'Roles')}</a>
          <a className="admin-nav-link" href="/admin/org-structure">{t('admin.orgStructure.title', 'Organization structure')}</a>
          <a className="admin-nav-link" href="/admin/courses" aria-current="page">{t('admin.courseBuilder.title', 'Course builder')}</a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.courseBuilder.title', 'Course builder')}</h1>
            <p>{t('admin.courseBuilder.subtitle', 'Create draft courses and review existing course shells.')}</p>
          </div>
          <a href="/admin">{t('admin.courseBuilder.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.courseBuilder.createTitle', 'Create draft course')}</h2>
            {loadState.organizations.length === 0 ? (
              <EmptyState message={t('admin.courseBuilder.noOrganizations', 'No organizations available.')} />
            ) : (
              <form onSubmit={handleCreateCourse}>
                <label>
                  {t('admin.courseBuilder.courseTitle', 'Course title')}
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
                </label>
                <label>
                  {t('admin.courseBuilder.description', 'Description')}
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </label>
                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving'
                    ? t('admin.courseBuilder.saving', 'Creating...')
                    : t('admin.courseBuilder.create', 'Create draft')}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.courseBuilder.coursesTitle', 'Courses')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.courseBuilder.empty', 'No courses found.')} />
            ) : (
              <table>
                <tbody>
                  {loadState.courses.map((course) => (
                    <tr key={course.id}>
                      <td>{course.title}</td>
                      <td>{course.slug}</td>
                      <td><StatusBadge>{course.status}</StatusBadge></td>
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

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; slug: string; status: string };
type Lesson = { id: string; title: string; slug: string; description: string | null; order: number; status: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[] }
  | { status: 'error'; message: string };

function slugifyLessonTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sortLessons(lessons: Lesson[]) {
  return [...lessons].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

export function AdminLessonsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0');
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  async function loadLessons(courseId?: string) {
    try {
      const courses = await apiRequest<Course[]>('/courses');
      const nextCourseId = courseId || selectedCourseId || courses[0]?.id || '';
      const lessons = nextCourseId ? await apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`) : [];

      setSelectedCourseId(nextCourseId);
      setLoadState({ status: 'loaded', courses, lessons: sortLessons(lessons) });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.lessons.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.lessons.loadError', 'Unable to load lesson editor.');
      setLoadState({ status: 'error', message });
    }
  }

  useEffect(() => {
    void loadLessons();
  }, [t]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((course) => course.id === selectedCourseId) : undefined;
  }, [loadState, selectedCourseId]);

  async function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSubmitState({ status: 'idle' });
    await loadLessons(courseId);
  }

  async function handleCreateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse) {
      return;
    }

    const lessonTitle = title.trim();
    const slug = slugifyLessonTitle(lessonTitle);
    const orderValue = Number(order);

    if (!lessonTitle || !slug || !Number.isInteger(orderValue) || orderValue < 0) {
      setSubmitState({
        status: 'error',
        message: t('admin.lessons.invalidInput', 'Enter a lesson title and non-negative order number.'),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Lesson>(`/courses/${encodeURIComponent(selectedCourse.id)}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          title: lessonTitle,
          slug,
          description: description.trim() || undefined,
          order: orderValue,
          status: 'draft',
        }),
      });
      setTitle('');
      setDescription('');
      setOrder(String(orderValue + 1));
      setSubmitState({ status: 'idle' });
      await loadLessons(selectedCourse.id);
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.lessons.lessonExists', 'A lesson with this slug already exists in the selected course.')
          : t('admin.lessons.saveError', 'Unable to create lesson.');
      setSubmitState({ status: 'error', message });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.lessons.loading', 'Loading lesson editor...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState title={t('admin.lessons.title', 'Lesson editor')} message={loadState.message} variant="error" />
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
          <a className="admin-nav-link" href="/admin/lessons" aria-current="page">
            {t('admin.lessons.title', 'Lesson editor')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.lessons.title', 'Lesson editor')}</h1>
            <p>{t('admin.lessons.subtitle', 'Create draft lessons and control their display order.')}</p>
          </div>
          <a href="/admin">{t('admin.lessons.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.lessons.createTitle', 'Create lesson')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.lessons.noCourses', 'Create a course before adding lessons.')} />
            ) : (
              <form onSubmit={handleCreateLesson}>
                <label>
                  {t('admin.lessons.course', 'Course')}
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('admin.lessons.lessonTitle', 'Lesson title')}
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
                </label>
                <label>
                  {t('admin.lessons.order', 'Order')}
                  <input value={order} onChange={(event) => setOrder(event.target.value)} inputMode="numeric" />
                </label>
                <label>
                  {t('admin.lessons.description', 'Description')}
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </label>
                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving'
                    ? t('admin.lessons.saving', 'Creating...')
                    : t('admin.lessons.create', 'Create draft')}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.lessons.lessonsTitle', 'Lessons')}</h2>
            {loadState.lessons.length === 0 ? (
              <EmptyState message={t('admin.lessons.empty', 'No lessons found for the selected course.')} />
            ) : (
              <table>
                <tbody>
                  {loadState.lessons.map((lesson) => (
                    <tr key={lesson.id}>
                      <td>{lesson.order}</td>
                      <td>{lesson.title}</td>
                      <td>{lesson.slug}</td>
                      <td>
                        <StatusBadge>{lesson.status}</StatusBadge>
                      </td>
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

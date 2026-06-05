import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { slugify } from '../shared/slugify.js';
import { sortLessons } from '../shared/sortLessons.js';
import { EmptyState, PageState } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; slug: string; status: string };
type Lesson = { id: string; title: string; slug: string; description: string | null; order: number; status: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[] }
  | { status: 'error'; message: string };

type LessonStatus = 'draft' | 'published' | 'archived';

const LESSON_STATUSES: LessonStatus[] = ['draft', 'published', 'archived'];


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

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOrder, setEditOrder] = useState('0');
  const [editStatus, setEditStatus] = useState<LessonStatus>('draft');
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const loadLessons = useCallback(async (courseId?: string) => {
    try {
      const courses = await apiRequest<Course[]>('/courses');
      const nextCourseId = courseId ?? (selectedCourseId || courses[0]?.id || '');
      const lessons = nextCourseId
        ? await apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`)
        : [];

      setSelectedCourseId(nextCourseId);
      setLoadState({ status: 'loaded', courses, lessons: sortLessons(lessons) });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.lessons.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.lessons.loadError', 'Unable to load lesson editor.');
      setLoadState({ status: 'error', message });
    }
  }, [t, selectedCourseId]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((c) => c.id === selectedCourseId) : undefined;
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
    const slug = slugify(lessonTitle);
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

  async function handleUpdateStatus(lessonId: string, newStatus: string) {
    try {
      const updated = await apiRequest<Lesson>(`/lessons/${encodeURIComponent(lessonId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, lessons: sortLessons(prev.lessons.map((l) => (l.id === lessonId ? updated : l))) }
          : prev,
      );
    } catch {
      await loadLessons(selectedCourseId);
    }
  }

  function openEditDialog(lesson: Lesson) {
    setEditLesson(lesson);
    setEditTitle(lesson.title);
    setEditDescription(lesson.description ?? '');
    setEditOrder(String(lesson.order));
    setEditStatus(lesson.status as LessonStatus);
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdateLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editLesson) {
      return;
    }

    const newTitle = editTitle.trim();
    const newOrder = Number(editOrder);

    if (!newTitle || !Number.isInteger(newOrder) || newOrder < 0) {
      setEditState({
        status: 'error',
        message: t('admin.lessons.invalidInput', 'Enter a lesson title and non-negative order number.'),
      });
      return;
    }

    setEditState({ status: 'saving' });

    try {
      const updated = await apiRequest<Lesson>(`/lessons/${encodeURIComponent(editLesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: newTitle,
          description: editDescription.trim() || null,
          order: newOrder,
          status: editStatus,
        }),
      });
      editDialogRef.current?.close();
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, lessons: sortLessons(prev.lessons.map((l) => (l.id === editLesson.id ? updated : l))) }
          : prev,
      );
    } catch {
      setEditState({
        status: 'error',
        message: t('admin.lessons.editError', 'Unable to update lesson.'),
      });
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
            <p>{t('admin.lessons.subtitle', 'Create and edit lessons, control display order and status.')}</p>
          </div>
          <a href="/admin">{t('admin.lessons.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.lessons.createTitle', 'Create lesson')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.lessons.noCourses', 'Create a course before adding lessons.')} />
            ) : (
              <form className="admin-form" onSubmit={handleCreateLesson}>
                <div className="admin-form__field">
                  <label>{t('admin.lessons.course', 'Course')}</label>
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.lessons.lessonTitle', 'Lesson title')}</label>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.lessons.order', 'Order')}</label>
                  <input value={order} onChange={(event) => setOrder(event.target.value)} inputMode="numeric" />
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.lessons.description', 'Description')}</label>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
                </div>
                {submitState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">
                    {submitState.message}
                  </p>
                ) : null}
                <div className="admin-form__actions">
                  <button className="admin-btn admin-btn--primary" type="submit" disabled={submitState.status === 'saving'}>
                    {submitState.status === 'saving'
                      ? t('admin.lessons.saving', 'Creating...')
                      : t('admin.lessons.create', 'Create draft')}
                  </button>
                </div>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.lessons.lessonsTitle', 'Lessons')}</h2>
            {loadState.lessons.length === 0 ? (
              <EmptyState message={t('admin.lessons.empty', 'No lessons found for the selected course.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('admin.lessons.col.title', 'Title')}</th>
                    <th>{t('admin.lessons.col.slug', 'Slug')}</th>
                    <th>{t('admin.lessons.col.status', 'Status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loadState.lessons.map((lesson) => (
                    <tr key={lesson.id}>
                      <td>{lesson.order}</td>
                      <td>{lesson.title}</td>
                      <td>{lesson.slug}</td>
                      <td>
                        <select
                          className="admin-status-select"
                          value={lesson.status}
                          onChange={(event) => void handleUpdateStatus(lesson.id, event.target.value)}
                        >
                          {LESSON_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="admin-btn admin-btn--sm admin-btn--secondary"
                          type="button"
                          onClick={() => openEditDialog(lesson)}
                        >
                          {t('admin.lessons.edit', 'Edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </section>
      </section>

      <dialog ref={editDialogRef} className="admin-dialog">
        <header className="admin-dialog__header">
          <h2>{t('admin.lessons.editTitle', 'Edit lesson')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.lessons.close', 'Close')}
            onClick={() => editDialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateLesson}>
          <div className="admin-form__field">
            <label>{t('admin.lessons.lessonTitle', 'Lesson title')}</label>
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.lessons.order', 'Order')}</label>
            <input value={editOrder} onChange={(event) => setEditOrder(event.target.value)} inputMode="numeric" />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.lessons.col.status', 'Status')}</label>
            <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as LessonStatus)}>
              {LESSON_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form__field">
            <label>{t('admin.lessons.description', 'Description')}</label>
            <textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              maxLength={1000}
            />
          </div>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">
              {editState.message}
            </p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--primary" type="submit" disabled={editState.status === 'saving'}>
              {editState.status === 'saving'
                ? t('admin.lessons.updating', 'Saving...')
                : t('admin.lessons.update', 'Save changes')}
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              type="button"
              onClick={() => editDialogRef.current?.close()}
            >
              {t('admin.lessons.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}

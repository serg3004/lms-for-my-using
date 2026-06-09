import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, Card, PageState } from '../shared/ui.js';
import { getCourse, updateCourse, deleteCourse } from '../shared/api/courses.js';
import { listLessons, createLesson, updateLesson } from '../shared/api/lessons.js';
import type { CourseSummary, LessonSummary } from '../shared/api/types.js';
import '../styles/admin.css';
import '../styles/ui.css';

type CourseStatus = 'draft' | 'published' | 'archived';
type LessonStatus = 'draft' | 'published' | 'archived';

type PageLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; course: CourseSummary; lessons: LessonSummary[]; currentUser: CurrentUser }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string };
type LessonFormState = { status: 'idle' } | { status: 'submitting' } | { status: 'error'; message: string };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function lessonStatusBadge(status: string): { variant: 'published' | 'draft' | 'neutral'; label: string } {
  if (status === 'published') return { variant: 'published', label: 'Готов' };
  if (status === 'archived') return { variant: 'neutral', label: 'Архив' };
  return { variant: 'draft', label: 'Черновик' };
}

function courseStatusBadge(status: string): { variant: 'published' | 'draft' | 'neutral'; label: string } {
  if (status === 'published') return { variant: 'published', label: 'Опубликован' };
  if (status === 'archived') return { variant: 'neutral', label: 'Архив' };
  return { variant: 'draft', label: 'Черновик' };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AdminCourseBuilderPage() {
  const { t } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();

  const [pageState, setPageState] = useState<PageLoadState>({ status: 'idle' });
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonFormState, setLessonFormState] = useState<LessonFormState>({ status: 'idle' });

  const [showDelete, setShowDelete] = useState(false);

  const addLessonDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin'), href: '/admin' },
    { label: t('admin.courses.title', 'Courses'), href: '/admin/courses' },
    { label: t('admin.courses.builder', 'Builder'), href: `/admin/courses/${courseId}`, isCurrent: true },
  ];

  const loadData = useCallback(async () => {
    if (!courseId) return;
    setPageState({ status: 'loading' });
    try {
      const [course, lessons, currentUser] = await Promise.all([
        getCourse(courseId) as Promise<CourseSummary>,
        listLessons(courseId),
        getCurrentUser(),
      ]);
      setFormTitle(course.title);
      setFormDescription(course.description ?? '');
      setPageState({ status: 'loaded', course, lessons, currentUser });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setPageState({ status: 'unauthenticated', message: 'Сессия истекла. Войдите снова.' });
        return;
      }
      setPageState({ status: 'error', message: 'Не удалось загрузить курс.' });
    }
  }, [courseId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (showAddLesson) addLessonDialogRef.current?.showModal();
    else addLessonDialogRef.current?.close();
  }, [showAddLesson]);

  useEffect(() => {
    if (showDelete) deleteDialogRef.current?.showModal();
    else deleteDialogRef.current?.close();
  }, [showDelete]);

  async function handleSaveCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    setSaveState({ status: 'saving' });
    try {
      await updateCourse(courseId, { title: formTitle.trim(), description: formDescription.trim() || undefined });
      setSaveState({ status: 'saved' });
      setTimeout(() => setSaveState({ status: 'idle' }), 2000);
      void loadData();
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : 'Не удалось сохранить.',
      });
    }
  }

  async function handlePublish() {
    if (!courseId || pageState.status !== 'loaded') return;
    const newStatus: CourseStatus =
      pageState.course.status === 'published' ? 'archived' : 'published';
    try {
      await updateCourse(courseId, { status: newStatus });
      void loadData();
    } catch {
      // silently ignore
    }
  }

  async function handleDeleteCourse() {
    if (!courseId) return;
    try {
      await deleteCourse(courseId);
      window.location.assign('/admin/courses');
    } catch {
      setShowDelete(false);
    }
  }

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || pageState.status !== 'loaded') return;
    const title = lessonTitle.trim();
    const slug = slugify(title);
    if (!slug) {
      setLessonFormState({ status: 'error', message: 'Введите название урока.' });
      return;
    }
    setLessonFormState({ status: 'submitting' });
    try {
      await createLesson(courseId, {
        organizationId: pageState.currentUser.organizationId,
        title,
        slug,
        description: lessonDesc.trim() || undefined,
        order: pageState.lessons.length,
        status: 'draft',
      });
      setShowAddLesson(false);
      setLessonTitle('');
      setLessonDesc('');
      setLessonFormState({ status: 'idle' });
      void loadData();
    } catch (error) {
      setLessonFormState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : 'Не удалось создать урок.',
      });
    }
  }

  async function handleToggleLessonStatus(lesson: LessonSummary) {
    const newStatus: LessonStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      await updateLesson(lesson.id, { status: newStatus });
      void loadData();
    } catch {
      // silently ignore
    }
  }

  if (pageState.status === 'idle' || pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message="Загрузка курса..." variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState message={pageState.message} variant="error" action={<a href="/login">Войти</a>} />
      </main>
    );
  }

  if (pageState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState message={pageState.message} variant="error" />
      </main>
    );
  }

  const { course, lessons } = pageState;
  const { variant: statusVariant, label: statusLabel } = courseStatusBadge(course.status);

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={course.title}
        subtitle={`${lessons.length} уроков · обновлён ${formatDate(course.updatedAt)}`}
        action={
          <Button variant="secondary" size="sm" type="button" onClick={() => window.location.assign('/admin/courses')}>
            ← К списку
          </Button>
        }
      />

      <div className="edit-layout">
        {/* Left: main content */}
        <div>
          <Card style={{ marginBottom: '20px' }}>
            <div className="ds-card__title">Основная информация</div>
            <form onSubmit={(e) => void handleSaveCourse(e)}>
              <div className="ds-field">
                <label className="ds-field__label" htmlFor="cb-title">Название курса</label>
                <input
                  id="cb-title"
                  className="ds-input"
                  type="text"
                  maxLength={160}
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="ds-field">
                <label className="ds-field__label" htmlFor="cb-desc">Описание</label>
                <textarea
                  id="cb-desc"
                  className="ds-input"
                  rows={4}
                  maxLength={1000}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              {saveState.status === 'error' ? (
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--color-danger)' }} role="alert">
                  {saveState.message}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={saveState.status === 'saving'}
                >
                  {saveState.status === 'saving' ? 'Сохранение...' : 'Сохранить'}
                </Button>
                {saveState.status === 'saved' ? (
                  <span style={{ fontSize: '13px', color: 'var(--color-success)' }}>Сохранено ✓</span>
                ) : null}
              </div>
            </form>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="ds-card__title" style={{ marginBottom: 0 }}>Уроки</div>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  setLessonTitle('');
                  setLessonDesc('');
                  setLessonFormState({ status: 'idle' });
                  setShowAddLesson(true);
                }}
              >
                + Добавить урок
              </Button>
            </div>

            {lessons.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
                Уроков пока нет. Добавьте первый урок.
              </p>
            ) : (
              <div className="lesson-list">
                {lessons
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((lesson, idx) => {
                    const { variant, label } = lessonStatusBadge(lesson.status);
                    return (
                      <div key={lesson.id} className="lesson-row">
                        <span className="lesson-row__drag" aria-hidden="true">⠿</span>
                        <span className="lesson-row__num">{idx + 1}</span>
                        <span className="lesson-row__title">{lesson.title}</span>
                        <Badge variant={variant} style={{ marginRight: '4px' }}>{label}</Badge>
                        <div className="lesson-row__actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            title={lesson.status === 'published' ? 'Снять с публикации' : 'Опубликовать'}
                            onClick={() => void handleToggleLessonStatus(lesson)}
                          >
                            ✏
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: sidebar */}
        <div>
          <Card style={{ marginBottom: '16px' }}>
            <div className="ds-card__title">Публикация</div>
            <div className="info-row">
              <span className="info-row__label">Статус</span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <div className="info-row">
              <span className="info-row__label">Уроков</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>{lessons.length}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Создан</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {formatDate(course.createdAt)}
              </span>
            </div>
            <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
              <Button
                variant={course.status === 'published' ? 'secondary' : 'primary'}
                type="button"
                style={{ width: '100%' }}
                onClick={() => void handlePublish()}
              >
                {course.status === 'published' ? 'Снять с публикации' : 'Опубликовать'}
              </Button>
              <Button
                variant="danger"
                type="button"
                style={{ width: '100%' }}
                onClick={() => setShowDelete(true)}
              >
                Удалить курс
              </Button>
            </div>
          </Card>

          <Card>
            <div className="ds-card__title">Статистика</div>
            <div className="info-row">
              <span className="info-row__label">Записано</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Завершили</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Средний балл</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Add lesson dialog */}
      <dialog className="admin-dialog" ref={addLessonDialogRef} onClose={() => setShowAddLesson(false)}>
        <div className="admin-dialog__header">
          <h2>Добавить урок</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label="Закрыть"
            onClick={() => setShowAddLesson(false)}
          >
            ✕
          </button>
        </div>
        <form className="admin-form" onSubmit={(e) => void handleAddLesson(e)}>
          <div className="admin-form__field">
            <label htmlFor="lesson-title">Название урока *</label>
            <input
              id="lesson-title"
              required
              maxLength={160}
              type="text"
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
            />
          </div>
          <div className="admin-form__field">
            <label htmlFor="lesson-desc">Описание</label>
            <textarea
              id="lesson-desc"
              maxLength={1000}
              rows={3}
              value={lessonDesc}
              onChange={(e) => setLessonDesc(e.target.value)}
            />
          </div>
          {lessonFormState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{lessonFormState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowAddLesson(false)}>
              Отмена
            </button>
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={lessonFormState.status === 'submitting'}
            >
              {lessonFormState.status === 'submitting' ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete course dialog */}
      <dialog className="admin-dialog" ref={deleteDialogRef} onClose={() => setShowDelete(false)}>
        <div className="admin-dialog__header">
          <h2>Удалить курс</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label="Закрыть"
            onClick={() => setShowDelete(false)}
          >
            ✕
          </button>
        </div>
        <div className="admin-form">
          <p style={{ margin: 0, color: 'var(--color-text)' }}>
            Удалить «{course.title}»? Это действие необратимо.
          </p>
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowDelete(false)}>
              Отмена
            </button>
            <button className="admin-btn admin-btn--danger" type="button" onClick={() => void handleDeleteCourse()}>
              Удалить
            </button>
          </div>
        </div>
      </dialog>
    </AdminPageLayout>
  );
}

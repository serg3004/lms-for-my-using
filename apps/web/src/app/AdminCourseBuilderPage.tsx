import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, ApiClientError } from '../shared/apiClient.js';
import type { CurrentUser } from '../shared/apiClient.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { toCourseMutation, validateCourseForm, validateLessonForm } from './course-builder/model.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Badge, Button, Card, PageState } from '../shared/ui.js';
import { getCourse } from '../shared/api/courses.js';
import { listLessons } from '../shared/api/lessons.js';
import type { CourseSummary, LessonSummary } from '../shared/api/types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { useCourseBuilderMutations } from './course-builder/useCourseBuilderMutations.js';

type CourseStatus = 'draft' | 'published' | 'archived';
type LessonStatus = 'draft' | 'published' | 'archived';

type CourseBuilderData = { course: CourseSummary; lessons: LessonSummary[]; currentUser: CurrentUser };

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

function lessonStatusBadge(status: string, t: TFunction): { variant: 'published' | 'draft' | 'neutral'; label: string } {
  if (status === 'published') return { variant: 'published', label: t('admin.courseBuilder.lessonStatus.published', 'Ready') };
  if (status === 'archived') return { variant: 'neutral', label: t('admin.courseBuilder.lessonStatus.archived', 'Archived') };
  return { variant: 'draft', label: t('admin.courseBuilder.lessonStatus.draft', 'Draft') };
}

function courseStatusBadge(status: string, t: TFunction): { variant: 'published' | 'draft' | 'neutral'; label: string } {
  if (status === 'published') return { variant: 'published', label: t('admin.courses.status.published', 'Published') };
  if (status === 'archived') return { variant: 'neutral', label: t('admin.courses.status.archived', 'Archived') };
  return { variant: 'draft', label: t('admin.courses.status.draft', 'Draft') };
}

function formatDate(value: string, language: string): string {
  return new Date(value).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AdminCourseBuilderPage() {
  const { t, i18n } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const mutations = useCourseBuilderMutations();

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonFormState, setLessonFormState] = useState<LessonFormState>({ status: 'idle' });
  const [courseErrors, setCourseErrors] = useState<FormValidationErrors<'title'>>({});
  const [lessonErrors, setLessonErrors] = useState<FormValidationErrors<'title'>>({});

  const [showDelete, setShowDelete] = useState(false);

  const addLessonDialogRef = useRef<HTMLDialogElement>(null);

  const navItems: AdminNavItem[] = [
    { label: t('admin.title', 'Admin'), href: '/admin' },
    { label: t('admin.courses.title', 'Courses'), href: '/admin/courses' },
    { label: t('admin.courses.builder', 'Builder'), href: `/admin/courses/${courseId}`, isCurrent: true },
  ];

  const { state: pageState, reload: loadData } = useAsyncData<CourseBuilderData>(
    async () => {
      if (!courseId) throw new Error('Missing course id');
      const [course, lessons, currentUser] = await Promise.all([
        getCourse(courseId) as Promise<CourseSummary>,
        listLessons(courseId),
        getCurrentUser(),
      ]);
      return { course, lessons, currentUser };
    },
    [courseId, t],
    {
      unauthenticated: t('admin.courseBuilder.sessionExpired', 'Your session expired. Sign in again.'),
      error: t('admin.courseBuilder.loadError', 'Unable to load the course.'),
    },
  );

  useEffect(() => {
    if (pageState.status === 'loaded') {
      setFormTitle(pageState.data.course.title);
      setFormDescription(pageState.data.course.description ?? '');
    }
  }, [pageState]);

  useEffect(() => {
    if (showAddLesson) addLessonDialogRef.current?.showModal();
    else addLessonDialogRef.current?.close();
  }, [showAddLesson]);


  async function handleSaveCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    const nextCourseErrors = validateCourseForm({ title: formTitle, description: formDescription }, t);
    setCourseErrors(nextCourseErrors);
    if (hasValidationErrors(nextCourseErrors)) return;
    setSaveState({ status: 'saving' });
    try {
      await mutations.updateCourse(courseId, toCourseMutation({ title: formTitle, description: formDescription }));
      setSaveState({ status: 'saved' });
      setTimeout(() => setSaveState({ status: 'idle' }), 2000);
      void loadData();
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : t('admin.courseBuilder.saveError', 'Unable to save.'),
      });
    }
  }

  async function handleStatusChange(newStatus: CourseStatus) {
    if (!courseId) return;
    try {
      await mutations.updateCourse(courseId, { status: newStatus });
      void loadData();
    } catch {
      // silently ignore
    }
  }

  async function handleDeleteCourse() {
    if (!courseId) return;
    try {
      await mutations.deleteCourse(courseId);
      window.location.assign('/admin/courses');
    } catch {
      setShowDelete(false);
    }
  }

  async function handleAddLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || pageState.status !== 'loaded') return;
    const title = lessonTitle.trim();
    const nextLessonErrors = validateLessonForm({ title, description: lessonDesc }, t);
    setLessonErrors(nextLessonErrors);
    if (hasValidationErrors(nextLessonErrors)) return;
    const slug = slugify(title);
    setLessonFormState({ status: 'submitting' });
    try {
      await mutations.createLesson(courseId, {
        organizationId: pageState.data.currentUser.organizationId,
        title,
        slug,
        description: lessonDesc.trim() || undefined,
        order: pageState.data.lessons.length,
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
        message: error instanceof ApiClientError ? error.message : t('admin.courseBuilder.lessonSaveError', 'Unable to create the lesson.'),
      });
    }
  }

  async function handleToggleLessonStatus(lesson: LessonSummary) {
    const newStatus: LessonStatus = lesson.status === 'published' ? 'draft' : 'published';
    try {
      await mutations.updateLesson(lesson.id, { status: newStatus });
      void loadData();
    } catch {
      // silently ignore
    }
  }

  if (pageState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.courseBuilder.loading', 'Loading course...')} variant="loading" />
      </main>
    );
  }

  if (pageState.status === 'unauthenticated') {
    return (
      <main className="admin-state">
        <PageState
          message={pageState.message}
          variant="error"
          action={<a href="/login">{t('admin.courseBuilder.signIn', 'Sign in')}</a>}
        />
      </main>
    );
  }

  if (pageState.status === 'error' || pageState.status === 'notFound') {
    return (
      <main className="admin-state">
        <PageState message={pageState.message} variant="error" />
      </main>
    );
  }

  const { course, lessons } = pageState.data;
  const { variant: statusVariant, label: statusLabel } = courseStatusBadge(course.status, t);

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.sidebarLabel', 'Admin navigation')}
      navItems={navItems}
    >
      <AdminPageHeader
        eyebrow={t('admin.courseBuilder.eyebrow', 'Course editor')}
        title={course.title}
        subtitle={`${t('admin.courseBuilder.lessonsCount', { count: lessons.length })} · ${t('admin.courseBuilder.updatedAt', { date: formatDate(course.updatedAt, i18n.resolvedLanguage ?? i18n.language) })}`}
        action={
          <Button variant="secondary" size="sm" type="button" onClick={() => window.location.assign('/admin/courses')}>
            ← {t('admin.courseBuilder.backToList', 'Back to list')}
          </Button>
        }
      />

      <div className="edit-layout">
        {/* Left: main content */}
        <div>
          <Card style={{ marginBottom: '20px' }}>
            <div className="ds-card__title">{t('admin.courseBuilder.infoTitle', 'Basic information')}</div>
            <form onSubmit={(e) => void handleSaveCourse(e)}>
              <FormField id="cb-title" label={t('admin.courses.form.title', 'Course title')} required error={courseErrors.title}>
                <input
                  id="cb-title"
                  type="text"
                  maxLength={160}
                  aria-describedby={courseErrors.title ? 'cb-title-error' : undefined}
                  aria-invalid={Boolean(courseErrors.title)}
                  value={formTitle}
                  onChange={(e) => {
                    setFormTitle(e.target.value);
                    setCourseErrors((err) => clearFieldError(err, 'title'));
                  }}
                />
              </FormField>
              <FormField id="cb-desc" label={t('admin.courses.form.description', 'Description')}>
                <textarea
                  id="cb-desc"
                  rows={4}
                  maxLength={1000}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </FormField>
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
                  {saveState.status === 'saving' ? t('admin.courseBuilder.saving', 'Saving...') : t('admin.courseBuilder.save', 'Save')}
                </Button>
                {saveState.status === 'saved' ? (
                  <span style={{ fontSize: '13px', color: 'var(--color-success)' }}>{t('admin.courseBuilder.saved', 'Saved ✓')}</span>
                ) : null}
              </div>
            </form>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="ds-card__title" style={{ marginBottom: 0 }}>{t('admin.lessons.lessonsTitle', 'Lessons')}</div>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => {
                  setLessonTitle('');
                  setLessonDesc('');
                  setLessonFormState({ status: 'idle' });
                  setLessonErrors({});
                  setShowAddLesson(true);
                }}
              >
                + {t('admin.courseBuilder.addLesson', 'Add lesson')}
              </Button>
            </div>

            {lessons.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
                {t('admin.courseBuilder.noLessons', 'No lessons yet. Add the first one.')}
              </p>
            ) : (
              <div className="lesson-list">
                {lessons
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((lesson, idx) => {
                    const { variant, label } = lessonStatusBadge(lesson.status, t);
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
                            title={lesson.status === 'published'
                              ? t('admin.courseBuilder.unpublish', 'Unpublish')
                              : t('admin.courseBuilder.publish', 'Publish')}
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
          <Card style={{ marginBottom: '16px', padding: 0, overflow: 'hidden' }}>
            <div style={{ height: '160px', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }} />
            <div style={{ padding: '18px' }}>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              <h2 style={{ margin: '10px 0 6px', fontSize: 'var(--text-lg)' }}>{course.title}</h2>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                {t('admin.courseBuilder.previewNote', 'This is how the course card will appear to learners.')}
              </p>
            </div>
          </Card>

          <Card style={{ marginBottom: '16px' }}>
            <div className="ds-card__title">{t('admin.courseBuilder.publicationTitle', 'Publication')}</div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courses.col.status', 'Status')}</span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courseBuilder.lessonsCountLabel', 'Lessons')}</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>{lessons.length}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courseBuilder.createdLabel', 'Created')}</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {formatDate(course.createdAt, i18n.resolvedLanguage ?? i18n.language)}
              </span>
            </div>
            <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
              <select
                value={course.status}
                onChange={(e) => void handleStatusChange(e.target.value as CourseStatus)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                <option value="draft">{t('admin.courses.status.draft', 'Draft')}</option>
                <option value="published">{t('admin.courses.status.published', 'Published')}</option>
                <option value="archived">{t('admin.courses.status.archived', 'Archived')}</option>
              </select>
              <Button
                variant="danger"
                type="button"
                style={{ width: '100%' }}
                onClick={() => setShowDelete(true)}
              >
                {t('admin.courses.deleteTitle', 'Delete course')}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="ds-card__title">{t('admin.courseBuilder.statsTitle', 'Statistics')}</div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courseBuilder.enrolledLabel', 'Enrolled')}</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courseBuilder.completedLabel', 'Completed')}</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('admin.courseBuilder.avgScoreLabel', 'Average score')}</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>—</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Add lesson dialog */}
      <dialog className="admin-dialog" ref={addLessonDialogRef} onClose={() => setShowAddLesson(false)}>
        <div className="admin-dialog__header">
          <h2>{t('admin.courseBuilder.addLesson', 'Add lesson')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.courseBuilder.close', 'Close')}
            onClick={() => setShowAddLesson(false)}
          >
            ✕
          </button>
        </div>
        <form className="admin-form" onSubmit={(e) => void handleAddLesson(e)}>
          <FormField id="lesson-title" label={t('admin.courseBuilder.lessonTitleLabel', 'Lesson title')} required error={lessonErrors.title}>
            <input
              id="lesson-title"
              maxLength={160}
              type="text"
              aria-describedby={lessonErrors.title ? 'lesson-title-error' : undefined}
              aria-invalid={Boolean(lessonErrors.title)}
              value={lessonTitle}
              onChange={(e) => {
                setLessonTitle(e.target.value);
                setLessonErrors((err) => clearFieldError(err, 'title'));
              }}
            />
          </FormField>
          <FormField id="lesson-desc" label={t('admin.courses.form.description', 'Description')}>
            <textarea
              id="lesson-desc"
              maxLength={1000}
              rows={3}
              value={lessonDesc}
              onChange={(e) => setLessonDesc(e.target.value)}
            />
          </FormField>
          {lessonFormState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{lessonFormState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowAddLesson(false)}>
              {t('admin.courseBuilder.cancel', 'Cancel')}
            </button>
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={lessonFormState.status === 'submitting'}
            >
              {lessonFormState.status === 'submitting' ? t('admin.courseBuilder.saving', 'Saving...') : t('admin.courseBuilder.add', 'Add')}
            </button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={showDelete}
        title={t('admin.courses.deleteTitle', 'Delete course')}
        message={t('admin.courses.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', { title: course.title })}
        confirmLabel={t('admin.courseBuilder.delete', 'Delete')}
        cancelLabel={t('admin.courseBuilder.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => void handleDeleteCourse()}
        onCancel={() => setShowDelete(false)}
      />
    </AdminPageLayout>
  );
}

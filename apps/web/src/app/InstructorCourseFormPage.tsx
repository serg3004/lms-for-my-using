import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ApiClientError, createCourse, getCourse, getCurrentUser, updateCourse } from '../shared/apiClient.js';
import { createLesson, listLessons, updateLesson } from '../shared/api/lessons.js';
import type { LessonSummary } from '../shared/api/types.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { FormField } from '../shared/adminPage.js';
import { clearFieldError, hasValidationErrors, type FormValidationErrors } from '../shared/formValidation.js';
import { slugify } from '../shared/slugify.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type Mode = 'create' | 'edit';

type FormState = {
  title: string;
  slug: string;
  description: string;
  category: string;
  durationMinutes: string;
  status: string;
};

type InstructorCourseFormData = { organizationId: string; firstName: string; lastName: string | null; lessons: LessonSummary[]; updatedAt: string | null };

type LessonField = 'title';
type LessonDialogState = { status: 'idle' } | { status: 'submitting' } | { status: 'error'; message: string };

type InstructorCourseFormPageProps = {
  mode: Mode;
  courseId?: string;
};

export function InstructorCourseFormPage({ mode, courseId }: InstructorCourseFormPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({ title: '', slug: '', description: '', category: '', durationMinutes: '', status: 'draft' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showAddLesson, setShowAddLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonSummary | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonErrors, setLessonErrors] = useState<FormValidationErrors<LessonField>>({});
  const [lessonDialogState, setLessonDialogState] = useState<LessonDialogState>({ status: 'idle' });
  const addLessonDialogRef = useRef<HTMLDialogElement>(null);
  const editLessonDialogRef = useRef<HTMLDialogElement>(null);

  const { state: loadState, mutate } = useAsyncData<InstructorCourseFormData>(
    async () => {
      const user = await getCurrentUser();

      let lessons: LessonSummary[] = [];
      let updatedAt: string | null = null;

      if (mode === 'edit' && courseId) {
        const [course, courseLessons] = await Promise.all([getCourse(courseId), listLessons(courseId)]);
        setForm({
          title: course.title,
          slug: course.slug,
          description: course.description ?? '',
          category: course.category ?? '',
          durationMinutes: course.durationMinutes != null ? String(course.durationMinutes) : '',
          status: course.status,
        });
        lessons = [...courseLessons].sort((a, b) => a.order - b.order);
        updatedAt = course.updatedAt;
      }

      return { organizationId: user.organizationId, firstName: user.firstName, lastName: user.lastName, lessons, updatedAt };
    },
    [mode, courseId, t],
    { unauthenticated: t('instructor.courseForm.loadError'), error: t('instructor.courseForm.loadError') },
  );

  async function reloadLessons() {
    if (mode !== 'edit' || !courseId) return;
    const refreshedLessons = await listLessons(courseId);
    mutate((data) => ({ ...data, lessons: [...refreshedLessons].sort((a, b) => a.order - b.order) }));
  }

  useEffect(() => {
    if (showAddLesson) addLessonDialogRef.current?.showModal();
    else addLessonDialogRef.current?.close();
  }, [showAddLesson]);

  useEffect(() => {
    if (editingLesson) editLessonDialogRef.current?.showModal();
    else editLessonDialogRef.current?.close();
  }, [editingLesson]);

  function updateField(field: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loadState.status !== 'loaded') return;
    setSubmitError(null);
    setIsSubmitting(true);

    const category = form.category || undefined;
    const durationMinutes = form.durationMinutes ? Number(form.durationMinutes) : undefined;

    try {
      if (mode === 'create') {
        await createCourse({
          organizationId: loadState.data.organizationId,
          title: form.title.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || undefined,
          category,
          durationMinutes,
          status: 'draft',
        });
      } else if (courseId) {
        await updateCourse(courseId, {
          title: form.title.trim(),
          slug: form.slug.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
        });
      }
      navigate('/instructor/courses');
    } catch {
      setSubmitError(t('instructor.courseForm.saveError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddLesson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loadState.status !== 'loaded' || !courseId) return;
    const title = lessonTitle.trim();
    const nextErrors = title ? {} : { title: t('instructor.courseForm.lessonTitleRequired') };
    setLessonErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;

    setLessonDialogState({ status: 'submitting' });
    try {
      await createLesson(courseId, {
        organizationId: loadState.data.organizationId,
        title,
        slug: slugify(title),
        order: loadState.data.lessons.length,
        status: 'draft',
      });
      setShowAddLesson(false);
      setLessonTitle('');
      setLessonDialogState({ status: 'idle' });
      await reloadLessons();
    } catch (error) {
      setLessonDialogState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : t('instructor.courseForm.lessonSaveError'),
      });
    }
  }

  async function handleEditLesson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingLesson) return;
    const title = lessonTitle.trim();
    const nextErrors = title ? {} : { title: t('instructor.courseForm.lessonTitleRequired') };
    setLessonErrors(nextErrors);
    if (hasValidationErrors(nextErrors)) return;

    setLessonDialogState({ status: 'submitting' });
    try {
      await updateLesson(editingLesson.id, { title });
      setEditingLesson(null);
      setLessonTitle('');
      setLessonDialogState({ status: 'idle' });
      await reloadLessons();
    } catch (error) {
      setLessonDialogState({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : t('instructor.courseForm.lessonSaveError'),
      });
    }
  }

  function openAddLessonDialog() {
    setLessonTitle('');
    setLessonErrors({});
    setLessonDialogState({ status: 'idle' });
    setShowAddLesson(true);
  }

  function openEditLessonDialog(lesson: LessonSummary) {
    setLessonTitle(lesson.title);
    setLessonErrors({});
    setLessonDialogState({ status: 'idle' });
    setEditingLesson(lesson);
  }

  const firstName = loadState.status === 'loaded' ? loadState.data.firstName : undefined;
  const lastName = loadState.status === 'loaded' ? (loadState.data.lastName ?? undefined) : undefined;
  const eyebrow = mode === 'create' ? t('instructor.courseForm.eyebrowCreate') : t('instructor.courseForm.eyebrowEdit');
  const pageTitle = mode === 'create' ? t('instructor.courseForm.createTitle') : t('instructor.courseForm.editTitle');
  const subtitle = mode === 'create' ? t('instructor.courseForm.subCreate') : t('instructor.courseForm.subEdit');
  const submitLabel = mode === 'create' ? t('instructor.courseForm.submitCreate') : t('instructor.courseForm.submitSave');
  const lessons = loadState.status === 'loaded' ? loadState.data.lessons : [];
  const updatedAt = loadState.status === 'loaded' ? loadState.data.updatedAt : null;

  return (
    <InstructorPageLayout firstName={firstName} lastName={lastName}>
      <Link to="/instructor/courses">← {t('instructor.courseForm.backToCourses')}</Link>

      {loadState.status === 'loading' && <p role="status">{t('instructor.courseForm.loading')}</p>}
      {(loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') && (
        <p role="alert">{loadState.message}</p>
      )}

      {loadState.status === 'loaded' && (
        <form id="course-form" onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start', margin: '12px 0 20px' }}>
            <div>
              <div style={{ color: 'var(--color-primary)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '7px' }}>
                {eyebrow}
              </div>
              <h1 style={{ margin: 0, fontSize: '2rem' }}>{pageTitle}</h1>
              <p style={{ color: 'var(--color-text-muted)', margin: '8px 0 0' }}>{subtitle}</p>
            </div>
            <button type="submit" form="course-form" disabled={isSubmitting} className="admin-btn admin-btn--primary">
              {isSubmitting ? t('instructor.courseForm.saving') : submitLabel}
            </button>
          </div>

          <div className="admin-content-grid">
            <article className="admin-card">
              <FormField id="title" label={t('instructor.courseForm.fieldTitle')} required>
                <input id="title" name="title" type="text" required value={form.title} onChange={updateField('title')} />
              </FormField>

              <FormField id="slug" label={t('instructor.courseForm.fieldSlug')} required>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  required
                  minLength={3}
                  maxLength={80}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={form.slug}
                  onChange={updateField('slug')}
                />
              </FormField>

              {mode === 'create' && (
                <FormField id="category" label={t('instructor.courseForm.fieldCategory')}>
                  <select id="category" name="category" value={form.category} onChange={updateField('category')}>
                    <option value="">{t('instructor.courseForm.categoryNone')}</option>
                    <option value="safety">{t('instructor.courseForm.categorySafety')}</option>
                    <option value="management">{t('instructor.courseForm.categoryManagement')}</option>
                  </select>
                </FormField>
              )}

              <FormField id="description" label={t('instructor.courseForm.fieldDescription')}>
                <textarea id="description" name="description" value={form.description} onChange={updateField('description')} rows={mode === 'create' ? 6 : 5} />
              </FormField>

              {mode === 'create' && (
                <FormField id="duration" label={t('instructor.courseForm.fieldDuration')}>
                  <input id="duration" name="duration" type="number" min={1} value={form.durationMinutes} onChange={updateField('durationMinutes')} />
                </FormField>
              )}

              {mode === 'edit' && (
                <>
                  <h3>{t('instructor.courseForm.lessonsTitle', { count: lessons.length })}</h3>
                  {lessons.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>{t('instructor.courseForm.lessonsEmpty')}</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
                      {lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: '12px', alignItems: 'center', padding: '14px', border: '1px solid var(--color-border)', borderRadius: '14px' }}
                        >
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'var(--color-accent-muted)', color: 'var(--color-primary)', fontWeight: 800 }}>
                            {lesson.order}
                          </div>
                          <span>{lesson.title}</span>
                          <button type="button" className="admin-btn" onClick={() => openEditLessonDialog(lesson)}>
                            {t('instructor.courseForm.editLesson')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="admin-btn" onClick={openAddLessonDialog}>
                    {t('instructor.courseForm.addLesson')}
                  </button>
                </>
              )}

              {submitError && (
                <p role="alert" style={{ color: 'red' }}>
                  {submitError}
                </p>
              )}
            </article>

            <article className="admin-card">
              {mode === 'create' ? (
                <>
                  <h3>{t('instructor.courseForm.nextStepsTitle')}</h3>
                  {[1, 2, 3].map((step) => (
                    <div key={step} style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: '12px', alignItems: 'center', padding: '14px', border: '1px solid var(--color-border)', borderRadius: '14px', marginBottom: '10px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'var(--color-accent-muted)', color: 'var(--color-primary)', fontWeight: 800 }}>
                        {step}
                      </div>
                      <div>{t(`instructor.courseForm.nextStep${step}`)}</div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <h3>{t('instructor.courseForm.publicationStatus')}</h3>
                  <FormField id="status" label={t('instructor.courseForm.fieldStatus')}>
                    <select id="status" name="status" value={form.status} onChange={updateField('status')}>
                      <option value="draft">{t('instructor.courseForm.statusDraft')}</option>
                      <option value="published">{t('instructor.courseForm.statusPublished')}</option>
                    </select>
                  </FormField>
                  {updatedAt ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      {t('instructor.courseForm.lastUpdated', { date: new Date(updatedAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language) })}
                    </p>
                  ) : null}
                </>
              )}
            </article>
          </div>
        </form>
      )}

      <dialog className="admin-dialog" ref={addLessonDialogRef} onClose={() => setShowAddLesson(false)}>
        <div className="admin-dialog__header">
          <h2>{t('instructor.courseForm.addLessonDialogTitle')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('instructor.courseForm.dialogClose')} onClick={() => setShowAddLesson(false)}>
            ✕
          </button>
        </div>
        <form className="admin-form" onSubmit={(e) => void handleAddLesson(e)}>
          <FormField id="lesson-title" label={t('instructor.courseForm.lessonFieldTitle')} required error={lessonErrors.title}>
            <input
              id="lesson-title"
              maxLength={160}
              type="text"
              value={lessonTitle}
              onChange={(e) => {
                setLessonTitle(e.target.value);
                setLessonErrors((err) => clearFieldError(err, 'title'));
              }}
            />
          </FormField>
          {lessonDialogState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{lessonDialogState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setShowAddLesson(false)}>
              {t('instructor.courseForm.dialogCancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={lessonDialogState.status === 'submitting'}>
              {lessonDialogState.status === 'submitting' ? t('instructor.courseForm.saving') : t('instructor.courseForm.addLesson')}
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="admin-dialog" ref={editLessonDialogRef} onClose={() => setEditingLesson(null)}>
        <div className="admin-dialog__header">
          <h2>{t('instructor.courseForm.editLessonDialogTitle')}</h2>
          <button className="admin-dialog__close" type="button" aria-label={t('instructor.courseForm.dialogClose')} onClick={() => setEditingLesson(null)}>
            ✕
          </button>
        </div>
        <form className="admin-form" onSubmit={(e) => void handleEditLesson(e)}>
          <FormField id="edit-lesson-title" label={t('instructor.courseForm.lessonFieldTitle')} required error={lessonErrors.title}>
            <input
              id="edit-lesson-title"
              maxLength={160}
              type="text"
              value={lessonTitle}
              onChange={(e) => {
                setLessonTitle(e.target.value);
                setLessonErrors((err) => clearFieldError(err, 'title'));
              }}
            />
          </FormField>
          {lessonDialogState.status === 'error' ? (
            <p className="admin-form__error" role="alert">{lessonDialogState.message}</p>
          ) : null}
          <div className="admin-form__actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditingLesson(null)}>
              {t('instructor.courseForm.dialogCancel')}
            </button>
            <button className="admin-btn admin-btn--primary" type="submit" disabled={lessonDialogState.status === 'submitting'}>
              {lessonDialogState.status === 'submitting' ? t('instructor.courseForm.saving') : t('instructor.courseForm.dialogSave')}
            </button>
          </div>
        </form>
      </dialog>
    </InstructorPageLayout>
  );
}

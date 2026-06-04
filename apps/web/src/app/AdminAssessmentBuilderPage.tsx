import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState } from '../shared/ui.js';
import '../styles/admin.css';

type Course = { id: string; organizationId: string; title: string; status: string };
type Lesson = { id: string; title: string; order: number };
type Assessment = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number | null;
  availableAfterCourseCompletion: boolean;
  status: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[]; assessments: Assessment[] }
  | { status: 'error'; message: string };

type AssessmentStatus = 'draft' | 'published' | 'archived';

const ASSESSMENT_STATUSES: AssessmentStatus[] = ['draft', 'published', 'archived'];

function slugifyAssessmentTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sortLessons(lessons: Lesson[]) {
  return [...lessons].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

export function AdminAssessmentBuilderPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState('70');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [availableAfterCourseCompletion, setAvailableAfterCourseCompletion] = useState(true);
  const [submitState, setSubmitState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editAssessment, setEditAssessment] = useState<Assessment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPassingScore, setEditPassingScore] = useState('70');
  const [editMaxAttempts, setEditMaxAttempts] = useState('');
  const [editAvailableAfterCompletion, setEditAvailableAfterCompletion] = useState(true);
  const [editStatus, setEditStatus] = useState<AssessmentStatus>('draft');
  const [editState, setEditState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({
    status: 'idle',
  });

  const loadAssessmentData = useCallback(async (courseId?: string) => {
    try {
      const [courses, assessments] = await Promise.all([
        apiRequest<Course[]>('/courses'),
        apiRequest<Assessment[]>('/assessments'),
      ]);
      const nextCourseId = courseId ?? (selectedCourseId || courses[0]?.id || '');
      const lessons = nextCourseId
        ? await apiRequest<Lesson[]>(`/courses/${encodeURIComponent(nextCourseId)}/lessons`)
        : [];

      setSelectedCourseId(nextCourseId);
      setLoadState({ status: 'loaded', courses, lessons: sortLessons(lessons), assessments });
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 401
          ? t('admin.assessmentBuilder.sessionExpired', 'Your session expired. Sign in again.')
          : t('admin.assessmentBuilder.loadError', 'Unable to load assessment builder.');
      setLoadState({ status: 'error', message });
    }
  }, [t, selectedCourseId]);

  useEffect(() => {
    void loadAssessmentData();
  }, [loadAssessmentData]);

  const selectedCourse = useMemo(() => {
    return loadState.status === 'loaded' ? loadState.courses.find((c) => c.id === selectedCourseId) : undefined;
  }, [loadState, selectedCourseId]);

  async function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedLessonId('');
    setSubmitState({ status: 'idle' });
    await loadAssessmentData(courseId);
  }

  async function handleCreateAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || !selectedCourse) {
      return;
    }

    const assessmentTitle = title.trim();
    const slug = slugifyAssessmentTitle(assessmentTitle);
    const scoreValue = Number(passingScore);
    const attemptsValue = maxAttempts.trim() ? Number(maxAttempts) : undefined;

    if (
      !assessmentTitle ||
      !slug ||
      !Number.isInteger(scoreValue) ||
      scoreValue < 0 ||
      scoreValue > 100 ||
      (attemptsValue !== undefined && (!Number.isInteger(attemptsValue) || attemptsValue < 1))
    ) {
      setSubmitState({
        status: 'error',
        message: t(
          'admin.assessmentBuilder.invalidInput',
          'Enter title, passing score 0–100, and optional attempts ≥ 1.',
        ),
      });
      return;
    }

    setSubmitState({ status: 'saving' });

    try {
      await apiRequest<Assessment>('/assessments', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedCourse.organizationId,
          courseId: selectedCourse.id,
          lessonId: selectedLessonId || undefined,
          title: assessmentTitle,
          slug,
          description: description.trim() || undefined,
          status: 'draft',
          passingScore: scoreValue,
          maxAttempts: attemptsValue,
          availableAfterCourseCompletion,
        }),
      });

      setTitle('');
      setDescription('');
      setPassingScore('70');
      setMaxAttempts('');
      setSelectedLessonId('');
      setAvailableAfterCourseCompletion(true);
      setSubmitState({ status: 'idle' });
      await loadAssessmentData(selectedCourse.id);
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? t('admin.assessmentBuilder.assessmentExists', 'An assessment with this slug already exists.')
          : t('admin.assessmentBuilder.saveError', 'Unable to create assessment.');
      setSubmitState({ status: 'error', message });
    }
  }

  async function handleUpdateStatus(assessmentId: string, newStatus: string) {
    try {
      const updated = await apiRequest<Assessment>(`/assessments/${encodeURIComponent(assessmentId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, assessments: prev.assessments.map((a) => (a.id === assessmentId ? updated : a)) }
          : prev,
      );
    } catch {
      await loadAssessmentData(selectedCourseId);
    }
  }

  function openEditDialog(assessment: Assessment) {
    setEditAssessment(assessment);
    setEditTitle(assessment.title);
    setEditDescription(assessment.description ?? '');
    setEditPassingScore(String(assessment.passingScore));
    setEditMaxAttempts(assessment.maxAttempts !== null ? String(assessment.maxAttempts) : '');
    setEditAvailableAfterCompletion(assessment.availableAfterCourseCompletion);
    setEditStatus(assessment.status as AssessmentStatus);
    setEditState({ status: 'idle' });
    editDialogRef.current?.showModal();
  }

  async function handleUpdateAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editAssessment) {
      return;
    }

    const newTitle = editTitle.trim();
    const scoreValue = Number(editPassingScore);
    const attemptsValue = editMaxAttempts.trim() ? Number(editMaxAttempts) : null;

    if (
      !newTitle ||
      !Number.isInteger(scoreValue) ||
      scoreValue < 0 ||
      scoreValue > 100 ||
      (attemptsValue !== null && (!Number.isInteger(attemptsValue) || attemptsValue < 1))
    ) {
      setEditState({
        status: 'error',
        message: t(
          'admin.assessmentBuilder.invalidInput',
          'Enter title, passing score 0–100, and optional attempts ≥ 1.',
        ),
      });
      return;
    }

    setEditState({ status: 'saving' });

    try {
      const updated = await apiRequest<Assessment>(`/assessments/${encodeURIComponent(editAssessment.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: newTitle,
          description: editDescription.trim() || null,
          passingScore: scoreValue,
          maxAttempts: attemptsValue,
          availableAfterCourseCompletion: editAvailableAfterCompletion,
          status: editStatus,
        }),
      });
      editDialogRef.current?.close();
      setLoadState((prev) =>
        prev.status === 'loaded'
          ? { ...prev, assessments: prev.assessments.map((a) => (a.id === editAssessment.id ? updated : a)) }
          : prev,
      );
    } catch {
      setEditState({
        status: 'error',
        message: t('admin.assessmentBuilder.editError', 'Unable to update assessment.'),
      });
    }
  }

  if (loadState.status === 'loading') {
    return (
      <main className="admin-state">
        <PageState message={t('admin.assessmentBuilder.loading', 'Loading assessment builder...')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="admin-state">
        <PageState
          title={t('admin.assessmentBuilder.title', 'Assessment builder')}
          message={loadState.message}
          variant="error"
        />
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
          <a className="admin-nav-link" href="/admin/lessons">
            {t('admin.lessons.title', 'Lesson editor')}
          </a>
          <a className="admin-nav-link" href="/admin/materials">
            {t('admin.materials.title', 'Materials')}
          </a>
          <a className="admin-nav-link" href="/admin/assessments" aria-current="page">
            {t('admin.assessmentBuilder.title', 'Assessment builder')}
          </a>
        </nav>
      </aside>

      <section className="admin-shell">
        <header className="admin-topbar">
          <div>
            <h1>{t('admin.assessmentBuilder.title', 'Assessment builder')}</h1>
            <p>{t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')}</p>
          </div>
          <a href="/admin">{t('admin.assessmentBuilder.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.assessmentBuilder.createTitle', 'Create assessment')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.assessmentBuilder.noCourses', 'Create a course before adding assessments.')} />
            ) : (
              <form className="admin-form" onSubmit={handleCreateAssessment}>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.course', 'Course')}</label>
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.lesson', 'Lesson')}</label>
                  <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.assessmentBuilder.noLesson', 'No lesson (course-level)')}</option>
                    {loadState.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order}. {lesson.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.assessmentTitle', 'Title')}</label>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
                  {title.trim() ? (
                    <span className="admin-form__hint">
                      slug: {slugifyAssessmentTitle(title)}
                    </span>
                  ) : null}
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.passingScore', 'Passing score (0–100)')}</label>
                  <input
                    value={passingScore}
                    onChange={(event) => setPassingScore(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.maxAttempts', 'Max attempts (blank = unlimited)')}</label>
                  <input
                    value={maxAttempts}
                    onChange={(event) => setMaxAttempts(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="admin-form__field">
                  <label>
                    <input
                      type="checkbox"
                      checked={availableAfterCourseCompletion}
                      onChange={(event) => setAvailableAfterCourseCompletion(event.target.checked)}
                    />
                    {' '}
                    {t('admin.assessmentBuilder.availableAfterCompletion', 'Available after course completion')}
                  </label>
                </div>
                <div className="admin-form__field">
                  <label>{t('admin.assessmentBuilder.description', 'Description')}</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={2000}
                  />
                </div>
                {submitState.status === 'error' ? (
                  <p className="admin-form__error" role="alert">
                    {submitState.message}
                  </p>
                ) : null}
                <div className="admin-form__actions">
                  <button
                    className="admin-btn admin-btn--primary"
                    type="submit"
                    disabled={submitState.status === 'saving'}
                  >
                    {submitState.status === 'saving'
                      ? t('admin.assessmentBuilder.saving', 'Creating...')
                      : t('admin.assessmentBuilder.create', 'Create draft')}
                  </button>
                </div>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.assessmentBuilder.assessmentsTitle', 'Assessments')}</h2>
            {loadState.assessments.length === 0 ? (
              <EmptyState message={t('admin.assessmentBuilder.empty', 'No assessments found.')} />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.assessmentBuilder.col.title', 'Title')}</th>
                    <th>{t('admin.assessmentBuilder.col.score', 'Pass score')}</th>
                    <th>{t('admin.assessmentBuilder.col.status', 'Status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loadState.assessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td>{assessment.title}</td>
                      <td>{assessment.passingScore}%</td>
                      <td>
                        <select
                          className="admin-status-select"
                          value={assessment.status}
                          onChange={(event) => void handleUpdateStatus(assessment.id, event.target.value)}
                        >
                          {ASSESSMENT_STATUSES.map((s) => (
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
                          onClick={() => openEditDialog(assessment)}
                        >
                          {t('admin.assessmentBuilder.edit', 'Edit')}
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
          <h2>{t('admin.assessmentBuilder.editTitle', 'Edit assessment')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.assessmentBuilder.close', 'Close')}
            onClick={() => editDialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form className="admin-form" onSubmit={handleUpdateAssessment}>
          <div className="admin-form__field">
            <label>{t('admin.assessmentBuilder.assessmentTitle', 'Title')}</label>
            <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={200} />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.assessmentBuilder.passingScore', 'Passing score (0–100)')}</label>
            <input
              value={editPassingScore}
              onChange={(event) => setEditPassingScore(event.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.assessmentBuilder.maxAttempts', 'Max attempts (blank = unlimited)')}</label>
            <input
              value={editMaxAttempts}
              onChange={(event) => setEditMaxAttempts(event.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="admin-form__field">
            <label>{t('admin.assessmentBuilder.col.status', 'Status')}</label>
            <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as AssessmentStatus)}>
              {ASSESSMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form__field">
            <label>
              <input
                type="checkbox"
                checked={editAvailableAfterCompletion}
                onChange={(event) => setEditAvailableAfterCompletion(event.target.checked)}
              />
              {' '}
              {t('admin.assessmentBuilder.availableAfterCompletion', 'Available after course completion')}
            </label>
          </div>
          <div className="admin-form__field">
            <label>{t('admin.assessmentBuilder.description', 'Description')}</label>
            <textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              maxLength={2000}
            />
          </div>
          {editState.status === 'error' ? (
            <p className="admin-form__error" role="alert">
              {editState.message}
            </p>
          ) : null}
          <div className="admin-form__actions">
            <button
              className="admin-btn admin-btn--primary"
              type="submit"
              disabled={editState.status === 'saving'}
            >
              {editState.status === 'saving'
                ? t('admin.assessmentBuilder.updating', 'Saving...')
                : t('admin.assessmentBuilder.update', 'Save changes')}
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              type="button"
              onClick={() => editDialogRef.current?.close()}
            >
              {t('admin.assessmentBuilder.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}

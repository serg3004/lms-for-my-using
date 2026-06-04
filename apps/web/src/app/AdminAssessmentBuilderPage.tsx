import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';
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

  const loadAssessmentData = useCallback(async (courseId?: string) => {
    try {
      const [courses, assessments] = await Promise.all([
        apiRequest<Course[]>('/courses'),
        apiRequest<Assessment[]>('/assessments'),
      ]);
      const nextCourseId = courseId || selectedCourseId || courses[0]?.id || '';
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
    return loadState.status === 'loaded' ? loadState.courses.find((course) => course.id === selectedCourseId) : undefined;
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
        message: t('admin.assessmentBuilder.invalidInput', 'Enter title, passing score from 0 to 100, and optional attempts >= 1.'),
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
        <PageState title={t('admin.assessmentBuilder.title', 'Assessment builder')} message={loadState.message} variant="error" />
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
            <p>{t('admin.assessmentBuilder.subtitle', 'Create draft assessments for courses and lessons.')}</p>
          </div>
          <a href="/admin">{t('admin.assessmentBuilder.backToDashboard', 'Back to dashboard')}</a>
        </header>

        <section className="admin-content-grid">
          <article className="admin-card">
            <h2>{t('admin.assessmentBuilder.createTitle', 'Create assessment')}</h2>
            {loadState.courses.length === 0 ? (
              <EmptyState message={t('admin.assessmentBuilder.noCourses', 'Create a course before adding assessments.')} />
            ) : (
              <form onSubmit={handleCreateAssessment}>
                <label>
                  {t('admin.assessmentBuilder.course', 'Course')}
                  <select value={selectedCourseId} onChange={(event) => void handleCourseChange(event.target.value)}>
                    {loadState.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('admin.assessmentBuilder.lesson', 'Lesson')}
                  <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
                    <option value="">{t('admin.assessmentBuilder.noLesson', 'No lesson')}</option>
                    {loadState.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order}. {lesson.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('admin.assessmentBuilder.assessmentTitle', 'Assessment title')}
                  <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
                </label>
                <label>
                  {t('admin.assessmentBuilder.passingScore', 'Passing score')}
                  <input value={passingScore} onChange={(event) => setPassingScore(event.target.value)} inputMode="numeric" />
                </label>
                <label>
                  {t('admin.assessmentBuilder.maxAttempts', 'Max attempts')}
                  <input value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} inputMode="numeric" />
                </label>
                <label>
                  <input
                    checked={availableAfterCourseCompletion}
                    onChange={(event) => setAvailableAfterCourseCompletion(event.target.checked)}
                    type="checkbox"
                  />
                  {t('admin.assessmentBuilder.availableAfterCompletion', 'Available after course completion')}
                </label>
                <label>
                  {t('admin.assessmentBuilder.description', 'Description')}
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
                </label>
                {submitState.status === 'error' ? <p role="alert">{submitState.message}</p> : null}
                <button type="submit" disabled={submitState.status === 'saving'}>
                  {submitState.status === 'saving'
                    ? t('admin.assessmentBuilder.saving', 'Creating...')
                    : t('admin.assessmentBuilder.create', 'Create draft')}
                </button>
              </form>
            )}
          </article>

          <article className="admin-card">
            <h2>{t('admin.assessmentBuilder.assessmentsTitle', 'Assessments')}</h2>
            {loadState.assessments.length === 0 ? (
              <EmptyState message={t('admin.assessmentBuilder.empty', 'No assessments found.')} />
            ) : (
              <table>
                <tbody>
                  {loadState.assessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td>{assessment.title}</td>
                      <td>{assessment.slug}</td>
                      <td>{assessment.passingScore}%</td>
                      <td>
                        <StatusBadge>{assessment.status}</StatusBadge>
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

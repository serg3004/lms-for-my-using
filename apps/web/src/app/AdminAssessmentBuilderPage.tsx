import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { slugify } from '../shared/slugify.js';
import { sortLessons } from '../shared/sortLessons.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState } from '../shared/ui.js';
import type { PaginatedResponse } from '../shared/api/types.js';
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

type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

type Question = {
  id: string;
  organizationId: string;
  type: QuestionType;
  title: string;
  text: string | null;
  points: number;
  order: number;
};

type AnswerOption = {
  id: string;
  text: string | null;
  isCorrect: boolean;
  order: number;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: Course[]; lessons: Lesson[]; assessments: Assessment[] }
  | { status: 'error'; message: string };

type AssessmentStatus = 'draft' | 'published' | 'archived';

const ASSESSMENT_STATUSES: AssessmentStatus[] = ['draft', 'published', 'archived'];

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

  const questionsDialogRef = useRef<HTMLDialogElement>(null);
  const [questionsAssessment, setQuestionsAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<string, AnswerOption[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [qTitle, setQTitle] = useState('');
  const [qType, setQType] = useState<QuestionType>('single_choice');
  const [qPoints, setQPoints] = useState('1');
  const [qSaving, setQSaving] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null);
  const [optText, setOptText] = useState('');
  const [optIsCorrect, setOptIsCorrect] = useState(false);
  const [optSaving, setOptSaving] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
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
      const [{ items: courses }, assessments] = await Promise.all([
        apiRequest<PaginatedResponse<Course>>('/courses?pageSize=200'),
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
    const slug = slugify(assessmentTitle, 120);
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

  async function openQuestionsDialog(assessment: Assessment) {
    setQuestionsAssessment(assessment);
    setQuestionsLoading(true);
    setQuestions([]);
    setOptionsByQuestion({});
    setQTitle('');
    setQType('single_choice');
    setQPoints('1');
    setQError(null);
    setAddingOptionFor(null);
    questionsDialogRef.current?.showModal();
    try {
      const qs = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`);
      const optResults = await Promise.all(
        qs.map((q) => apiRequest<AnswerOption[]>(`/questions/${encodeURIComponent(q.id)}/options`)),
      );
      const optsMap: Record<string, AnswerOption[]> = {};
      qs.forEach((q, i) => { optsMap[q.id] = optResults[i] ?? []; });
      setQuestions(qs);
      setOptionsByQuestion(optsMap);
    } catch {
      // вопросы остаются пустыми
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function handleAddQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!questionsAssessment || loadState.status !== 'loaded') return;
    const title = qTitle.trim();
    if (!title) return;
    const orgId = loadState.courses[0]?.organizationId ?? '';
    setQSaving(true);
    setQError(null);
    try {
      const created = await apiRequest<Question>(
        `/assessments/${encodeURIComponent(questionsAssessment.id)}/questions`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId: orgId, type: qType, title, points: Number(qPoints) || 1, order: questions.length }),
        },
      );
      setQuestions((prev) => [...prev, created]);
      setOptionsByQuestion((prev) => ({ ...prev, [created.id]: [] }));
      setQTitle('');
      setQPoints('1');
    } catch (err) {
      setQError(err instanceof ApiClientError ? err.message : t('admin.assessmentBuilder.questionSaveError', 'Failed to add question.'));
    } finally {
      setQSaving(false);
    }
  }

  async function handleAddOption(questionId: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = optText.trim();
    if (!text || loadState.status !== 'loaded') return;
    const orgId = loadState.courses[0]?.organizationId ?? '';
    const existingCount = optionsByQuestion[questionId]?.length ?? 0;
    setOptSaving(true);
    setOptError(null);
    try {
      const created = await apiRequest<AnswerOption>(
        `/questions/${encodeURIComponent(questionId)}/options`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId: orgId, text, isCorrect: optIsCorrect, order: existingCount }),
        },
      );
      setOptionsByQuestion((prev) => ({ ...prev, [questionId]: [...(prev[questionId] ?? []), created] }));
      setOptText('');
      setOptIsCorrect(false);
      setAddingOptionFor(null);
    } catch (err) {
      setOptError(err instanceof ApiClientError ? err.message : t('admin.assessmentBuilder.optionSaveError', 'Failed to add option.'));
    } finally {
      setOptSaving(false);
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

  const navItems: AdminNavItem[] = [
    { label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' },
    { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' },
    { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' },
    { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments', isCurrent: true },
  ];

  return (
    <AdminPageLayout
      brandLabel={t('admin.navLink', 'Admin')}
      sidebarLabel={t('admin.navLink', 'Admin')}
      navItems={navItems}
    >
      <AdminPageHeader
        title={t('admin.assessmentBuilder.title', 'Assessment builder')}
        subtitle={t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')}
        action={<a href="/admin">{t('admin.assessmentBuilder.backToDashboard', 'Back to dashboard')}</a>}
      />

      <section className="admin-content-grid">
        <AdminCard>
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
                      slug: {slugify(title, 120)}
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
        </AdminCard>

        <AdminCard>
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
                        <div className="td-actions">
                          <button
                            className="admin-btn admin-btn--sm admin-btn--secondary"
                            type="button"
                            onClick={() => openEditDialog(assessment)}
                          >
                            {t('admin.assessmentBuilder.edit', 'Edit')}
                          </button>
                          <button
                            className="admin-btn admin-btn--sm admin-btn--secondary"
                            type="button"
                            onClick={() => void openQuestionsDialog(assessment)}
                          >
                            {t('admin.assessmentBuilder.questions', 'Questions')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </AdminCard>
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
      {/* Questions management dialog */}
      <dialog ref={questionsDialogRef} className="admin-dialog" style={{ maxWidth: '720px', width: '100%' }}>
        <header className="admin-dialog__header">
          <h2>{questionsAssessment?.title} — {t('admin.assessmentBuilder.questionsTitle', 'Questions')}</h2>
          <button
            className="admin-dialog__close"
            type="button"
            aria-label={t('admin.assessmentBuilder.close', 'Close')}
            onClick={() => questionsDialogRef.current?.close()}
          >
            ×
          </button>
        </header>

        {questionsLoading ? (
          <p style={{ padding: '16px', color: 'var(--color-text-muted)' }}>
            {t('admin.assessmentBuilder.questionsLoading', 'Loading questions...')}
          </p>
        ) : (
          <div style={{ padding: '0 0 16px' }}>
            {questions.length === 0 ? (
              <p style={{ padding: '12px 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                {t('admin.assessmentBuilder.noQuestions', 'No questions yet.')}
              </p>
            ) : (
              <ol style={{ margin: '0 0 16px', padding: '0', listStyle: 'none', display: 'grid', gap: '12px' }}>
                {questions.map((q, idx) => (
                  <li key={q.id} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginRight: '8px' }}>
                          {idx + 1}. [{q.type}] {q.points}pt
                        </span>
                        <strong style={{ fontSize: '14px' }}>{q.title}</strong>
                      </div>
                      <button
                        className="admin-btn admin-btn--sm admin-btn--secondary"
                        type="button"
                        onClick={() => {
                          setAddingOptionFor(addingOptionFor === q.id ? null : q.id);
                          setOptText('');
                          setOptIsCorrect(false);
                          setOptError(null);
                        }}
                      >
                        + {t('admin.assessmentBuilder.addOption', 'Add option')}
                      </button>
                    </div>

                    {(optionsByQuestion[q.id] ?? []).length > 0 && (
                      <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: '13px' }}>
                        {(optionsByQuestion[q.id] ?? []).map((opt) => (
                          <li key={opt.id} style={{ color: opt.isCorrect ? 'var(--color-success)' : 'inherit' }}>
                            {opt.isCorrect ? '✓ ' : '○ '}{opt.text}
                          </li>
                        ))}
                      </ul>
                    )}

                    {addingOptionFor === q.id && (
                      <form
                        style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
                        onSubmit={(e) => void handleAddOption(q.id, e)}
                      >
                        <input
                          style={{ flex: '1', minWidth: '160px' }}
                          placeholder={t('admin.assessmentBuilder.optionText', 'Option text')}
                          value={optText}
                          onChange={(e) => setOptText(e.target.value)}
                          maxLength={500}
                        />
                        <label style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            checked={optIsCorrect}
                            onChange={(e) => setOptIsCorrect(e.target.checked)}
                          />
                          {t('admin.assessmentBuilder.correct', 'Correct')}
                        </label>
                        <button className="admin-btn admin-btn--sm admin-btn--primary" type="submit" disabled={optSaving}>
                          {optSaving ? '...' : t('admin.assessmentBuilder.addOption', 'Add option')}
                        </button>
                        {optError && <p className="admin-form__error" role="alert" style={{ width: '100%', margin: 0 }}>{optError}</p>}
                      </form>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>
                {t('admin.assessmentBuilder.addQuestion', 'Add question')}
              </h3>
              <form className="admin-form" onSubmit={(e) => void handleAddQuestion(e)}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'end' }}>
                  <div className="admin-form__field" style={{ margin: 0 }}>
                    <label>{t('admin.assessmentBuilder.questionTitle', 'Question text')}</label>
                    <input value={qTitle} onChange={(e) => setQTitle(e.target.value)} maxLength={200} />
                  </div>
                  <div className="admin-form__field" style={{ margin: 0 }}>
                    <label>{t('admin.assessmentBuilder.questionType', 'Type')}</label>
                    <select value={qType} onChange={(e) => setQType(e.target.value as QuestionType)}>
                      <option value="single_choice">{t('admin.assessmentBuilder.singleChoice', 'Single choice')}</option>
                      <option value="multiple_choice">{t('admin.assessmentBuilder.multipleChoice', 'Multiple choice')}</option>
                      <option value="true_false">{t('admin.assessmentBuilder.trueFalse', 'True / False')}</option>
                    </select>
                  </div>
                  <div className="admin-form__field" style={{ margin: 0 }}>
                    <label>{t('admin.assessmentBuilder.points', 'Points')}</label>
                    <input value={qPoints} onChange={(e) => setQPoints(e.target.value)} inputMode="numeric" style={{ width: '60px' }} />
                  </div>
                </div>
                {qError && <p className="admin-form__error" role="alert" style={{ marginTop: '8px' }}>{qError}</p>}
                <div className="admin-form__actions" style={{ marginTop: '12px' }}>
                  <button className="admin-btn admin-btn--primary" type="submit" disabled={qSaving}>
                    {qSaving ? t('admin.assessmentBuilder.saving', 'Creating...') : t('admin.assessmentBuilder.addQuestionBtn', 'Add question')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </dialog>
    </AdminPageLayout>
  );
}

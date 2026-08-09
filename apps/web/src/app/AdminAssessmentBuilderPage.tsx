import { type FormEvent, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { AdminStatusSelect } from '../shared/AdminStatusSelect.js';
import { AdminPageHeader, AdminPageLayout, ConfirmDialog, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { Button, DataTable, EmptyState, PageState, SearchInput, Toolbar, type Column } from '../shared/ui.js';
import type { AssessmentAttemptSummary } from '../shared/api/types.js';
import { buildAssessmentAnswers, countAnsweredQuestions, getAssessmentOptionLabel, selectedIds, type SelectedAnswers } from './assessment-taking/model.js';
import { AssessmentSettingsForm } from './assessment-builder/AssessmentSettingsForm.js';
import { QuestionsEditor } from './assessment-builder/QuestionsEditor.js';
import { ASSESSMENT_STATUSES, assessmentFormReducer, assessmentToForm, buildPreviewQuestionsWithOptions, describePreviewAnswerSelection, emptyAssessmentForm, filterAssessments, mapAssessmentForm, type AnswerOption, type Assessment, type AssessmentPreviewResult, type AssessmentStatus, type Question, type SaveState } from './assessment-builder/model.js';
import { useAssessmentBuilder } from './assessment-builder/useAssessmentBuilder.js';

export function AdminAssessmentBuilderPage() {
  const { t } = useTranslation();
  const builder = useAssessmentBuilder(t);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AssessmentStatus>('all');
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [createForm, dispatchCreate] = useReducer(assessmentFormReducer, undefined, emptyAssessmentForm);
  const [createState, setCreateState] = useState<SaveState>({ status: 'idle' });
  const [createTitleErrors, setCreateTitleErrors] = useState<FormValidationErrors<'title'>>({});
  const [editForm, dispatchEdit] = useReducer(assessmentFormReducer, undefined, emptyAssessmentForm);
  const [editState, setEditState] = useState<SaveState>({ status: 'idle' });
  const [editTitleErrors, setEditTitleErrors] = useState<FormValidationErrors<'title'>>({});
  const [editAssessment, setEditAssessment] = useState<Assessment | null>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const questionsDialogRef = useRef<HTMLDialogElement>(null);
  const [questionsAssessment, setQuestionsAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Record<string, AnswerOption[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const invalidMessage = t('admin.assessmentBuilder.invalidInput', 'Enter title, passing score 0–100, and optional attempts ≥ 1.');
  const [rowStats, setRowStats] = useState<Record<string, { questionsCount: number; attemptsCount: number }>>({});
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const previewRequestRef = useRef(0);
  const [previewAssessment, setPreviewAssessment] = useState<Assessment | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [previewOptions, setPreviewOptions] = useState<Record<string, AnswerOption[]>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSelected, setPreviewSelected] = useState<SelectedAnswers>({});
  const [previewSubmit, setPreviewSubmit] = useState<
    { status: 'idle' } | { status: 'submitting' } | { status: 'done'; result: AssessmentPreviewResult } | { status: 'error'; message: string }
  >({ status: 'idle' });

  const statusLabels: Record<AssessmentStatus, string> = {
    draft: t('admin.assessmentBuilder.status.draft', 'Draft'),
    published: t('admin.assessmentBuilder.status.published', 'Published'),
    archived: t('admin.assessmentBuilder.status.archived', 'Archived'),
  };

  useEffect(() => {
    if (builder.loadState.status !== 'loaded') return;
    let isMounted = true;
    async function loadRowStats() {
      if (builder.loadState.status !== 'loaded') return;
      try {
        const entries = await Promise.all(
          builder.loadState.assessments.map(async (assessment) => {
            const [assessmentQuestions, results] = await Promise.all([
              apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`),
              apiRequest<AssessmentAttemptSummary[]>(`/assessments/${encodeURIComponent(assessment.id)}/results`),
            ]);
            return [assessment.id, { questionsCount: assessmentQuestions.length, attemptsCount: results.length }] as const;
          }),
        );
        if (isMounted) setRowStats(Object.fromEntries(entries));
      } catch {
        if (isMounted) setRowStats({});
      }
    }
    void loadRowStats();
    return () => { isMounted = false; };
  }, [builder.loadState]);

  function openCreateDialog() {
    dispatchCreate({ type: 'reset' });
    builder.setSelectedLessonId('');
    setCreateTitleErrors({});
    setCreateState({ status: 'idle' });
    createDialogRef.current?.showModal();
  }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleErrors = validateRequiredFields([{ name: 'title', value: createForm.title, message: t('admin.assessmentBuilder.titleRequired', 'Assessment title is required.') }]);
    if (hasValidationErrors(titleErrors)) { setCreateTitleErrors(titleErrors); return; }
    setCreateTitleErrors({});
    const selectedCourse = builder.loadState.status === 'loaded' ? builder.loadState.courses.find((course) => course.id === builder.selectedCourseId) : undefined;
    const values = mapAssessmentForm(createForm); if (!values || !selectedCourse) { setCreateState({ status: 'error', message: invalidMessage }); return; }
    setCreateState({ status: 'saving' });
    try { await apiRequest('/assessments', { method: 'POST', body: JSON.stringify({ ...values, description: values.description ?? undefined, maxAttempts: values.maxAttempts ?? undefined, organizationId: selectedCourse.organizationId, courseId: selectedCourse.id, lessonId: builder.selectedLessonId || undefined, status: 'draft' }) }); dispatchCreate({ type: 'reset' }); builder.setSelectedLessonId(''); setCreateState({ status: 'idle' }); createDialogRef.current?.close(); await builder.load(selectedCourse.id); }
    catch (error) { setCreateState({ status: 'error', message: error instanceof ApiClientError && error.status === 409 ? t('admin.assessmentBuilder.assessmentExists', 'An assessment with this slug already exists.') : t('admin.assessmentBuilder.saveError', 'Unable to create assessment.') }); }
  }
  function openEdit(assessment: Assessment) { setEditAssessment(assessment); dispatchEdit({ type: 'reset', value: assessmentToForm(assessment) }); setEditState({ status: 'idle' }); setEditTitleErrors({}); editDialogRef.current?.showModal(); }
  async function updateAssessment(event: FormEvent<HTMLFormElement>) { event.preventDefault();
    const titleErrors = validateRequiredFields([{ name: 'title', value: editForm.title, message: t('admin.assessmentBuilder.titleRequired', 'Assessment title is required.') }]);
    if (hasValidationErrors(titleErrors)) { setEditTitleErrors(titleErrors); return; }
    setEditTitleErrors({});
    const values = mapAssessmentForm(editForm); if (!values || !editAssessment) { setEditState({ status: 'error', message: invalidMessage }); return; } setEditState({ status: 'saving' }); try { const payload = { title: values.title, description: values.description, passingScore: values.passingScore, maxAttempts: values.maxAttempts, availableAfterCourseCompletion: values.availableAfterCourseCompletion, status: values.status }; const updated = await apiRequest<Assessment>(`/assessments/${encodeURIComponent(editAssessment.id)}`, { method: 'PATCH', body: JSON.stringify(payload) }); editDialogRef.current?.close(); builder.replaceAssessment(updated); } catch { setEditState({ status: 'error', message: t('admin.assessmentBuilder.editError', 'Unable to update assessment.') }); } }
  async function updateStatus(id: string, status: string) {
    setStatusError(null);
    try {
      builder.replaceAssessment(await apiRequest<Assessment>(`/assessments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.assessmentBuilder.statusError', 'Unable to update status.'));
      await builder.load(builder.selectedCourseId);
    }
  }
  async function openQuestions(assessment: Assessment) { setQuestionsAssessment(assessment); setQuestions([]); setOptions({}); setQuestionsLoading(true); questionsDialogRef.current?.showModal(); try { const loadedQuestions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`); const loadedOptions = await Promise.all(loadedQuestions.map((question) => apiRequest<AnswerOption[]>(`/questions/${encodeURIComponent(question.id)}/options`))); setQuestions(loadedQuestions); setOptions(Object.fromEntries(loadedQuestions.map((question, index) => [question.id, loadedOptions[index] ?? []]))); } catch { setQuestions([]); } finally { setQuestionsLoading(false); } }
  async function openPreview(assessment: Assessment) {
    const requestToken = ++previewRequestRef.current; // unique per invocation, so A -> B -> A can't collide
    setPreviewAssessment(assessment);
    setPreviewQuestions([]);
    setPreviewOptions({});
    setPreviewLoading(true);
    setPreviewSelected({});
    setPreviewSubmit({ status: 'idle' });
    previewDialogRef.current?.showModal();
    try {
      const loadedQuestions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`);
      const loadedOptions = await Promise.all(loadedQuestions.map((question) => apiRequest<AnswerOption[]>(`/questions/${encodeURIComponent(question.id)}/options`)));
      if (previewRequestRef.current !== requestToken) return; // a newer preview was opened while this one was loading
      setPreviewQuestions(loadedQuestions);
      setPreviewOptions(Object.fromEntries(loadedQuestions.map((question, index) => [question.id, loadedOptions[index] ?? []])));
    } catch {
      if (previewRequestRef.current !== requestToken) return;
      setPreviewQuestions([]);
    } finally {
      if (previewRequestRef.current === requestToken) setPreviewLoading(false);
    }
  }
  function selectPreviewSingle(questionId: string, optionId: string) {
    setPreviewSelected((prev) => ({ ...prev, [questionId]: optionId }));
  }
  function selectPreviewMultiple(questionId: string, optionId: string, checked: boolean) {
    setPreviewSelected((prev) => {
      const current = selectedIds(prev[questionId]);
      const next = checked ? [...current, optionId] : current.filter((id) => id !== optionId);
      return { ...prev, [questionId]: next };
    });
  }
  function retryPreview() {
    setPreviewSelected({});
    setPreviewSubmit({ status: 'idle' });
  }
  async function submitPreview() {
    if (!previewAssessment) return;
    const questionsWithOptions = buildPreviewQuestionsWithOptions(previewQuestions, previewOptions);
    if (countAnsweredQuestions(questionsWithOptions, previewSelected) < questionsWithOptions.length) {
      setPreviewSubmit({ status: 'error', message: t('assessments.errorAnswerAll') });
      return;
    }
    setPreviewSubmit({ status: 'submitting' });
    try {
      const result = await apiRequest<AssessmentPreviewResult>(
        `/assessments/${encodeURIComponent(previewAssessment.id)}/attempts/preview`,
        { method: 'POST', body: JSON.stringify({ answers: buildAssessmentAnswers(questionsWithOptions, previewSelected) }) },
      );
      setPreviewSubmit({ status: 'done', result });
    } catch (error) {
      setPreviewSubmit({
        status: 'error',
        message: error instanceof ApiClientError ? error.message : t('admin.assessmentBuilder.previewSubmitError', 'Unable to submit preview.'),
      });
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/assessments/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      builder.removeAssessment(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setStatusError(error instanceof ApiClientError ? error.message : t('admin.assessmentBuilder.deleteError', 'Unable to delete assessment.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (builder.loadState.status === 'loading') return <main className="admin-state"><PageState message={t('admin.assessmentBuilder.loading', 'Loading assessment builder...')} variant="loading"/></main>;
  if (builder.loadState.status === 'error') return <main className="admin-state"><PageState title={t('admin.assessmentBuilder.title', 'Assessment builder')} message={builder.loadState.message} variant="error"/></main>;
  const data = builder.loadState;
  const filteredAssessments = filterAssessments(data.assessments, search, statusFilter);
  const navItems: AdminNavItem[] = [{ label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' }, { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' }, { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' }, { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments', isCurrent: true }];
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems}>
    <AdminPageHeader
      eyebrow={t('admin.assessmentBuilder.eyebrow', 'Knowledge control')}
      title={t('admin.assessmentBuilder.title', 'Assessment builder')}
      subtitle={t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')}
      action={
        <Button variant="primary" type="button" onClick={openCreateDialog} disabled={data.courses.length === 0}>
          + {t('admin.assessmentBuilder.create', 'Create assessment')}
        </Button>
      }
    />

    {statusError && (
      <div className="ui-state ui-state--error admin-inline-banner" role="alert">
        <p>{statusError}</p>
        <button type="button" className="admin-inline-banner__close" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => setStatusError(null)}>×</button>
      </div>
    )}

    <Toolbar
      left={
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('admin.assessmentBuilder.searchPlaceholder', 'Find assessment')}
        />
      }
      right={
        <select
          className="admin-status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | AssessmentStatus)}
        >
          <option value="all">{t('admin.assessmentBuilder.allStatuses', 'All statuses')}</option>
          {ASSESSMENT_STATUSES.map((status) => (
            <option key={status} value={status}>{statusLabels[status]}</option>
          ))}
        </select>
      }
    />

    <DataTable<Assessment>
      columns={[
        { key: 'title', label: t('admin.assessmentBuilder.col.title', 'Title'), render: (a) => a.title },
        { key: 'questions', label: t('admin.assessmentBuilder.col.questions', 'Questions'), render: (a) => rowStats[a.id]?.questionsCount ?? '—' },
        { key: 'status', label: t('admin.assessmentBuilder.col.status', 'Status'), render: (a) => (
          <AdminStatusSelect value={a.status} statuses={ASSESSMENT_STATUSES} labels={statusLabels} onChange={(status) => void updateStatus(a.id, status)} />
        )},
        { key: 'attempts', label: t('admin.assessmentBuilder.col.attempts', 'Attempts'), render: (a) => rowStats[a.id]?.attemptsCount ?? '—' },
        { key: 'actions', label: '', render: (a) => (
          <div className="td-actions">
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEdit(a)}>{t('admin.assessmentBuilder.edit', 'Edit')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openQuestions(a)}>{t('admin.assessmentBuilder.questions', 'Questions')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openPreview(a)}>{t('admin.assessmentBuilder.preview', 'Preview')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setDeleteTarget(a)}>{t('admin.assessmentBuilder.delete', 'Delete')}</button>
          </div>
        )},
      ] satisfies Column<Assessment>[]}
      rows={filteredAssessments}
      keyExtractor={(a) => a.id}
      emptyMessage={t('admin.assessmentBuilder.empty', 'No assessments found.')}
    />

    <dialog ref={createDialogRef} className="admin-dialog">
      <header className="admin-dialog__header"><h2>{t('admin.assessmentBuilder.createTitle', 'Create assessment')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => createDialogRef.current?.close()}>×</button></header>
      {data.courses.length === 0 ? <EmptyState message={t('admin.assessmentBuilder.noCourses', 'Create a course before adding assessments.')}/> : (
        <>
          <FormField id="assessment-create-course" label={t('admin.assessmentBuilder.course', 'Course')}>
            <select id="assessment-create-course" value={builder.selectedCourseId} onChange={(e) => { setCreateState({ status: 'idle' }); void builder.selectCourse(e.target.value); }}>
              {data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </FormField>
          <AssessmentSettingsForm form={createForm} dispatch={dispatchCreate} state={createState} onSubmit={createAssessment} t={t} lessons={data.lessons} lessonId={builder.selectedLessonId} onLessonChange={builder.setSelectedLessonId} titleError={createTitleErrors.title} onTitleChange={() => setCreateTitleErrors((prev) => clearFieldError(prev, 'title'))} onCancel={() => createDialogRef.current?.close()}/>
        </>
      )}
    </dialog>
    <dialog ref={editDialogRef} className="admin-dialog"><header className="admin-dialog__header"><h2>{t('admin.assessmentBuilder.editTitle', 'Edit assessment')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => editDialogRef.current?.close()}>×</button></header><AssessmentSettingsForm form={editForm} dispatch={dispatchEdit} state={editState} onSubmit={updateAssessment} t={t} editing statusLabels={statusLabels} onCancel={() => editDialogRef.current?.close()} titleError={editTitleErrors.title} onTitleChange={() => setEditTitleErrors((prev) => clearFieldError(prev, 'title'))}/></dialog>
    <dialog ref={questionsDialogRef} className="admin-dialog" style={{ maxWidth: '720px', width: '100%' }}><header className="admin-dialog__header"><h2>{questionsAssessment?.title} — {t('admin.assessmentBuilder.questionsTitle', 'Questions')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => questionsDialogRef.current?.close()}>×</button></header><QuestionsEditor assessment={questionsAssessment} courses={data.courses} loading={questionsLoading} questions={questions} setQuestions={setQuestions} options={options} setOptions={setOptions} t={t}/></dialog>

    <dialog ref={previewDialogRef} className="admin-dialog" style={{ maxWidth: '720px', width: '100%' }}>
      <header className="admin-dialog__header">
        <h2>{previewAssessment?.title} — {t('admin.assessmentBuilder.previewTitle', 'Preview')}</h2>
        <button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => previewDialogRef.current?.close()}>×</button>
      </header>
      {previewLoading ? (
        <PageState message={t('admin.assessmentBuilder.previewLoading', 'Loading preview...')} variant="loading"/>
      ) : previewQuestions.length === 0 ? (
        <EmptyState message={t('admin.assessmentBuilder.previewEmpty', 'This assessment has no questions yet.')}/>
      ) : previewSubmit.status === 'done' ? (
        <div className="admin-preview">
          <div className={`learner-quiz__result-banner ${previewSubmit.result.passed ? 'learner-quiz__result-banner--passed' : 'learner-quiz__result-banner--failed'}`}>
            <span className="learner-quiz__result-label">
              {previewSubmit.result.passed ? t('assessments.resultPassed') : t('assessments.resultFailed')}
            </span>
            <span className="learner-quiz__result-score">
              {t('assessments.resultScore', { score: previewSubmit.result.score, maxScore: previewSubmit.result.maxScore, percentage: previewSubmit.result.percentage })}
            </span>
            <span className="learner-quiz__result-passing">
              {t('assessments.resultPassingScore', { score: previewAssessment?.passingScore })}
            </span>
          </div>

          <section className="learner-quiz__breakdown">
            <h2>{t('assessments.resultBreakdown')}</h2>
            <ol className="learner-quiz__breakdown-list">
              {previewSubmit.result.answers.map((answer) => {
                const question = previewQuestions.find((q) => q.id === answer.questionId);
                const selectedLabel = describePreviewAnswerSelection(answer, previewOptions[answer.questionId] ?? []);
                return (
                  <li key={answer.questionId} className={`learner-quiz__breakdown-item ${answer.isCorrect ? 'learner-quiz__breakdown-item--correct' : 'learner-quiz__breakdown-item--wrong'}`}>
                    <div className="learner-quiz__breakdown-icon">{answer.isCorrect ? '✓' : '✗'}</div>
                    <div className="learner-quiz__breakdown-body">
                      <p className="learner-quiz__breakdown-question">{question?.title}</p>
                      <p className="learner-quiz__breakdown-answer">
                        <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultYourAnswer')}:</span>{' '}
                        {selectedLabel}
                      </p>
                      <p className="learner-quiz__breakdown-points">
                        {answer.score} / {question?.points ?? 0} {answer.isCorrect ? t('assessments.resultCorrect') : t('assessments.resultIncorrect')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="learner-quiz__result-actions">
            <button className="admin-btn admin-btn--secondary" type="button" onClick={retryPreview}>{t('assessments.retryBtn')}</button>
          </div>
        </div>
      ) : (
        <div className="admin-preview">
          {previewAssessment?.description && <p className="admin-preview__description">{previewAssessment.description}</p>}
          <p className="admin-preview__meta">
            {t('admin.assessmentBuilder.previewPassingScore', 'Passing score: {{score}}%', { score: previewAssessment?.passingScore })}
          </p>
          <ol className="admin-preview__questions">
            {previewQuestions.map((question) => (
              <li key={question.id} className="admin-preview__question">
                <p className="admin-preview__question-title">{question.title} <span className="admin-preview__points">{question.points}pt</span></p>
                {question.text && <p className="admin-preview__question-text">{question.text}</p>}
                <ul className="admin-preview__options">
                  {(previewOptions[question.id] ?? []).map((option) => {
                    const checked = question.type === 'multiple_choice'
                      ? selectedIds(previewSelected[question.id]).includes(option.id)
                      : previewSelected[question.id] === option.id;
                    return (
                      <li key={option.id}>
                        <label>
                          <input
                            type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                            name={`preview-${question.id}`}
                            checked={checked}
                            onChange={(e) => question.type === 'multiple_choice' ? selectPreviewMultiple(question.id, option.id, e.target.checked) : selectPreviewSingle(question.id, option.id)}
                          />
                          {' '}
                          {option.imageUrl ? (
                            <span className="admin-preview__option-content">
                              <img src={option.imageUrl} alt={option.text ?? ''} className="admin-preview__option-image"/>
                              {option.text && <span>{option.text}</span>}
                            </span>
                          ) : (
                            <span>{getAssessmentOptionLabel(option)}</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>

          {previewSubmit.status === 'error' && (
            <p className="learner-quiz__submit-error" role="alert">{previewSubmit.message}</p>
          )}

          <div className="learner-quiz__result-actions">
            <button className="admin-btn admin-btn--primary" type="button" disabled={previewSubmit.status === 'submitting'} onClick={() => void submitPreview()}>
              {previewSubmit.status === 'submitting' ? t('assessments.submitting') : t('assessments.submitBtn')}
            </button>
          </div>
        </div>
      )}
    </dialog>

    <ConfirmDialog
      open={deleteTarget !== null}
      title={t('admin.assessmentBuilder.deleteTitle', 'Delete assessment')}
      message={t('admin.assessmentBuilder.deleteConfirm', 'Delete "{{title}}"? This action cannot be undone.', { title: deleteTarget?.title ?? '' })}
      confirmLabel={deleting ? t('admin.assessmentBuilder.deleting', 'Deleting...') : t('admin.assessmentBuilder.delete', 'Delete')}
      cancelLabel={t('admin.assessmentBuilder.cancel', 'Cancel')}
      variant="danger"
      onConfirm={() => void confirmDelete()}
      onCancel={() => setDeleteTarget(null)}
    />
  </AdminPageLayout>;
}

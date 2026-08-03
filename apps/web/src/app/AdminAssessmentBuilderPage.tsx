import { type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { clearFieldError, hasValidationErrors, validateRequiredFields, type FormValidationErrors } from '../shared/formValidation.js';
import { AdminStatusSelect } from '../shared/AdminStatusSelect.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, FormField, type AdminNavItem } from '../shared/adminPage.js';
import { DataTable, EmptyState, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import type { AssessmentAttemptSummary } from '../shared/api/types.js';
import { AssessmentSettingsForm } from './assessment-builder/AssessmentSettingsForm.js';
import { QuestionsEditor } from './assessment-builder/QuestionsEditor.js';
import { ASSESSMENT_STATUSES, assessmentFormReducer, assessmentToForm, emptyAssessmentForm, mapAssessmentForm, type AnswerOption, type Assessment, type Question, type SaveState } from './assessment-builder/model.js';
import { useAssessmentBuilder } from './assessment-builder/useAssessmentBuilder.js';
import '../styles/admin.css';

export function AdminAssessmentBuilderPage() {
  const { t } = useTranslation();
  const builder = useAssessmentBuilder(t);
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
  const selectedCourse = useMemo(() => builder.loadState.status === 'loaded' ? builder.loadState.courses.find((course) => course.id === builder.selectedCourseId) : undefined, [builder.loadState, builder.selectedCourseId]);
  const invalidMessage = t('admin.assessmentBuilder.invalidInput', 'Enter title, passing score 0–100, and optional attempts ≥ 1.');
  const [attemptStats, setAttemptStats] = useState<{ totalAttempts: number; passRate: number | null } | null>(null);

  useEffect(() => {
    if (builder.loadState.status !== 'loaded') return;
    let isMounted = true;
    async function loadAttemptStats() {
      if (builder.loadState.status !== 'loaded') return;
      try {
        const results = await Promise.all(
          builder.loadState.assessments.map((assessment) =>
            apiRequest<AssessmentAttemptSummary[]>(`/assessments/${encodeURIComponent(assessment.id)}/results`),
          ),
        );
        const allAttempts = results.flat();
        const completed = allAttempts.filter((a) => a.status === 'completed');
        const passed = completed.filter((a) => a.passed).length;
        if (isMounted) {
          setAttemptStats({
            totalAttempts: allAttempts.length,
            passRate: completed.length > 0 ? Math.round((passed / completed.length) * 100) : null,
          });
        }
      } catch {
        if (isMounted) setAttemptStats(null);
      }
    }
    void loadAttemptStats();
    return () => { isMounted = false; };
  }, [builder.loadState]);

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleErrors = validateRequiredFields([{ name: 'title', value: createForm.title, message: t('admin.assessmentBuilder.titleRequired', 'Assessment title is required.') }]);
    if (hasValidationErrors(titleErrors)) { setCreateTitleErrors(titleErrors); return; }
    setCreateTitleErrors({});
    const values = mapAssessmentForm(createForm); if (!values || !selectedCourse) { setCreateState({ status: 'error', message: invalidMessage }); return; }
    setCreateState({ status: 'saving' });
    try { await apiRequest('/assessments', { method: 'POST', body: JSON.stringify({ ...values, description: values.description ?? undefined, maxAttempts: values.maxAttempts ?? undefined, organizationId: selectedCourse.organizationId, courseId: selectedCourse.id, lessonId: builder.selectedLessonId || undefined, status: 'draft' }) }); dispatchCreate({ type: 'reset' }); builder.setSelectedLessonId(''); setCreateState({ status: 'idle' }); await builder.load(selectedCourse.id); }
    catch (error) { setCreateState({ status: 'error', message: error instanceof ApiClientError && error.status === 409 ? t('admin.assessmentBuilder.assessmentExists', 'An assessment with this slug already exists.') : t('admin.assessmentBuilder.saveError', 'Unable to create assessment.') }); }
  }
  function openEdit(assessment: Assessment) { setEditAssessment(assessment); dispatchEdit({ type: 'reset', value: assessmentToForm(assessment) }); setEditState({ status: 'idle' }); setEditTitleErrors({}); editDialogRef.current?.showModal(); }
  async function updateAssessment(event: FormEvent<HTMLFormElement>) { event.preventDefault();
    const titleErrors = validateRequiredFields([{ name: 'title', value: editForm.title, message: t('admin.assessmentBuilder.titleRequired', 'Assessment title is required.') }]);
    if (hasValidationErrors(titleErrors)) { setEditTitleErrors(titleErrors); return; }
    setEditTitleErrors({});
    const values = mapAssessmentForm(editForm); if (!values || !editAssessment) { setEditState({ status: 'error', message: invalidMessage }); return; } setEditState({ status: 'saving' }); try { const payload = { title: values.title, description: values.description, passingScore: values.passingScore, maxAttempts: values.maxAttempts, availableAfterCourseCompletion: values.availableAfterCourseCompletion, status: values.status }; const updated = await apiRequest<Assessment>(`/assessments/${encodeURIComponent(editAssessment.id)}`, { method: 'PATCH', body: JSON.stringify(payload) }); editDialogRef.current?.close(); builder.replaceAssessment(updated); } catch { setEditState({ status: 'error', message: t('admin.assessmentBuilder.editError', 'Unable to update assessment.') }); } }
  async function updateStatus(id: string, status: string) { try { builder.replaceAssessment(await apiRequest<Assessment>(`/assessments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })); } catch { await builder.load(builder.selectedCourseId); } }
  async function openQuestions(assessment: Assessment) { setQuestionsAssessment(assessment); setQuestions([]); setOptions({}); setQuestionsLoading(true); questionsDialogRef.current?.showModal(); try { const loadedQuestions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`); const loadedOptions = await Promise.all(loadedQuestions.map((question) => apiRequest<AnswerOption[]>(`/questions/${encodeURIComponent(question.id)}/options`))); setQuestions(loadedQuestions); setOptions(Object.fromEntries(loadedQuestions.map((question, index) => [question.id, loadedOptions[index] ?? []]))); } catch { setQuestions([]); } finally { setQuestionsLoading(false); } }

  if (builder.loadState.status === 'loading') return <main className="admin-state"><PageState message={t('admin.assessmentBuilder.loading', 'Loading assessment builder...')} variant="loading"/></main>;
  if (builder.loadState.status === 'error') return <main className="admin-state"><PageState title={t('admin.assessmentBuilder.title', 'Assessment builder')} message={builder.loadState.message} variant="error"/></main>;
  const data = builder.loadState;
  const navItems: AdminNavItem[] = [{ label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' }, { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' }, { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' }, { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments', isCurrent: true }];
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems}>
    <AdminPageHeader title={t('admin.assessmentBuilder.title', 'Assessment builder')} subtitle={t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')} action={<a href="/admin">{t('admin.assessmentBuilder.backToDashboard', 'Back to dashboard')}</a>}/>
    <StatsGrid>
      <StatCard label={t('admin.assessmentBuilder.stats.total', 'Assessments')} value={data.assessments.length} />
      <StatCard label={t('admin.assessmentBuilder.stats.attempts', 'Total attempts')} value={attemptStats?.totalAttempts ?? '—'} />
      <StatCard label={t('admin.assessmentBuilder.stats.passRate', 'Pass rate')} value={attemptStats?.passRate != null ? `${attemptStats.passRate}%` : '—'} />
    </StatsGrid>
    <section className="admin-content-grid">
      <AdminCard>
        <h2>{t('admin.assessmentBuilder.createTitle', 'Create assessment')}</h2>
        {data.courses.length === 0 ? <EmptyState message={t('admin.assessmentBuilder.noCourses', 'Create a course before adding assessments.')}/> : (
          <>
            <FormField id="assessment-create-course" label={t('admin.assessmentBuilder.course', 'Course')}>
              <select id="assessment-create-course" value={builder.selectedCourseId} onChange={(e) => { setCreateState({ status: 'idle' }); void builder.selectCourse(e.target.value); }}>
                {data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </FormField>
            <AssessmentSettingsForm form={createForm} dispatch={dispatchCreate} state={createState} onSubmit={createAssessment} t={t} lessons={data.lessons} lessonId={builder.selectedLessonId} onLessonChange={builder.setSelectedLessonId} titleError={createTitleErrors.title} onTitleChange={() => setCreateTitleErrors((prev) => clearFieldError(prev, 'title'))}/>
          </>
        )}
      </AdminCard>
      <AdminCard>
        <h2>{t('admin.assessmentBuilder.assessmentsTitle', 'Assessments')}</h2>
        <DataTable<Assessment>
          columns={[
            { key: 'title', label: t('admin.assessmentBuilder.col.title', 'Title'), render: (a) => a.title },
            { key: 'score', label: t('admin.assessmentBuilder.col.score', 'Pass score'), render: (a) => `${a.passingScore}%` },
            { key: 'status', label: t('admin.assessmentBuilder.col.status', 'Status'), render: (a) => (
              <AdminStatusSelect value={a.status} statuses={ASSESSMENT_STATUSES} onChange={(status) => void updateStatus(a.id, status)} />
            )},
            { key: 'actions', label: '', render: (a) => (
              <div className="td-actions">
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEdit(a)}>{t('admin.assessmentBuilder.edit', 'Edit')}</button>
                <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openQuestions(a)}>{t('admin.assessmentBuilder.questions', 'Questions')}</button>
              </div>
            )},
          ] satisfies Column<Assessment>[]}
          rows={data.assessments}
          keyExtractor={(a) => a.id}
          emptyMessage={t('admin.assessmentBuilder.empty', 'No assessments found.')}
        />
      </AdminCard>
    </section>
    <dialog ref={editDialogRef} className="admin-dialog"><header className="admin-dialog__header"><h2>{t('admin.assessmentBuilder.editTitle', 'Edit assessment')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => editDialogRef.current?.close()}>×</button></header><AssessmentSettingsForm form={editForm} dispatch={dispatchEdit} state={editState} onSubmit={updateAssessment} t={t} editing onCancel={() => editDialogRef.current?.close()} titleError={editTitleErrors.title} onTitleChange={() => setEditTitleErrors((prev) => clearFieldError(prev, 'title'))}/></dialog>
    <dialog ref={questionsDialogRef} className="admin-dialog" style={{ maxWidth: '720px', width: '100%' }}><header className="admin-dialog__header"><h2>{questionsAssessment?.title} — {t('admin.assessmentBuilder.questionsTitle', 'Questions')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => questionsDialogRef.current?.close()}>×</button></header><QuestionsEditor assessment={questionsAssessment} courses={data.courses} loading={questionsLoading} questions={questions} setQuestions={setQuestions} options={options} setOptions={setOptions} t={t}/></dialog>
  </AdminPageLayout>;
}

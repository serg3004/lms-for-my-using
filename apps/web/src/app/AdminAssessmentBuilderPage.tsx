import { type FormEvent, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, apiRequest } from '../shared/apiClient.js';
import { AdminStatusSelect } from '../shared/AdminStatusSelect.js';
import { AdminCard, AdminPageHeader, AdminPageLayout, type AdminNavItem } from '../shared/adminPage.js';
import { EmptyState, PageState } from '../shared/ui.js';
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
  const [editForm, dispatchEdit] = useReducer(assessmentFormReducer, undefined, emptyAssessmentForm);
  const [editState, setEditState] = useState<SaveState>({ status: 'idle' });
  const [editAssessment, setEditAssessment] = useState<Assessment | null>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const questionsDialogRef = useRef<HTMLDialogElement>(null);
  const [questionsAssessment, setQuestionsAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Record<string, AnswerOption[]>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const selectedCourse = useMemo(() => builder.loadState.status === 'loaded' ? builder.loadState.courses.find((course) => course.id === builder.selectedCourseId) : undefined, [builder.loadState, builder.selectedCourseId]);
  const invalidMessage = t('admin.assessmentBuilder.invalidInput', 'Enter title, passing score 0–100, and optional attempts ≥ 1.');

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = mapAssessmentForm(createForm); if (!values || !selectedCourse) { setCreateState({ status: 'error', message: invalidMessage }); return; }
    setCreateState({ status: 'saving' });
    try { await apiRequest('/assessments', { method: 'POST', body: JSON.stringify({ ...values, description: values.description ?? undefined, maxAttempts: values.maxAttempts ?? undefined, organizationId: selectedCourse.organizationId, courseId: selectedCourse.id, lessonId: builder.selectedLessonId || undefined, status: 'draft' }) }); dispatchCreate({ type: 'reset' }); builder.setSelectedLessonId(''); setCreateState({ status: 'idle' }); await builder.load(selectedCourse.id); }
    catch (error) { setCreateState({ status: 'error', message: error instanceof ApiClientError && error.status === 409 ? t('admin.assessmentBuilder.assessmentExists', 'An assessment with this slug already exists.') : t('admin.assessmentBuilder.saveError', 'Unable to create assessment.') }); }
  }
  function openEdit(assessment: Assessment) { setEditAssessment(assessment); dispatchEdit({ type: 'reset', value: assessmentToForm(assessment) }); setEditState({ status: 'idle' }); editDialogRef.current?.showModal(); }
  async function updateAssessment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = mapAssessmentForm(editForm); if (!values || !editAssessment) { setEditState({ status: 'error', message: invalidMessage }); return; } setEditState({ status: 'saving' }); try { const payload = { title: values.title, description: values.description, passingScore: values.passingScore, maxAttempts: values.maxAttempts, availableAfterCourseCompletion: values.availableAfterCourseCompletion, status: values.status }; const updated = await apiRequest<Assessment>(`/assessments/${encodeURIComponent(editAssessment.id)}`, { method: 'PATCH', body: JSON.stringify(payload) }); editDialogRef.current?.close(); builder.replaceAssessment(updated); } catch { setEditState({ status: 'error', message: t('admin.assessmentBuilder.editError', 'Unable to update assessment.') }); } }
  async function updateStatus(id: string, status: string) { try { builder.replaceAssessment(await apiRequest<Assessment>(`/assessments/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })); } catch { await builder.load(builder.selectedCourseId); } }
  async function openQuestions(assessment: Assessment) { setQuestionsAssessment(assessment); setQuestions([]); setOptions({}); setQuestionsLoading(true); questionsDialogRef.current?.showModal(); try { const loadedQuestions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessment.id)}/questions`); const loadedOptions = await Promise.all(loadedQuestions.map((question) => apiRequest<AnswerOption[]>(`/questions/${encodeURIComponent(question.id)}/options`))); setQuestions(loadedQuestions); setOptions(Object.fromEntries(loadedQuestions.map((question, index) => [question.id, loadedOptions[index] ?? []]))); } catch { setQuestions([]); } finally { setQuestionsLoading(false); } }

  if (builder.loadState.status === 'loading') return <main className="admin-state"><PageState message={t('admin.assessmentBuilder.loading', 'Loading assessment builder...')} variant="loading"/></main>;
  if (builder.loadState.status === 'error') return <main className="admin-state"><PageState title={t('admin.assessmentBuilder.title', 'Assessment builder')} message={builder.loadState.message} variant="error"/></main>;
  const data = builder.loadState;
  const navItems: AdminNavItem[] = [{ label: t('admin.courseBuilder.title', 'Course builder'), href: '/admin/courses' }, { label: t('admin.lessons.title', 'Lesson editor'), href: '/admin/lessons' }, { label: t('admin.materials.title', 'Materials'), href: '/admin/materials' }, { label: t('admin.assessmentBuilder.title', 'Assessment builder'), href: '/admin/assessments', isCurrent: true }];
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} navItems={navItems}>
    <AdminPageHeader title={t('admin.assessmentBuilder.title', 'Assessment builder')} subtitle={t('admin.assessmentBuilder.subtitle', 'Create and manage assessments for courses and lessons.')} action={<a href="/admin">{t('admin.assessmentBuilder.backToDashboard', 'Back to dashboard')}</a>}/>
    <section className="admin-content-grid"><AdminCard><h2>{t('admin.assessmentBuilder.createTitle', 'Create assessment')}</h2>{data.courses.length === 0 ? <EmptyState message={t('admin.assessmentBuilder.noCourses', 'Create a course before adding assessments.')}/> : <><div className="admin-form__field"><label>{t('admin.assessmentBuilder.course', 'Course')}</label><select value={builder.selectedCourseId} onChange={(e) => { setCreateState({ status: 'idle' }); void builder.selectCourse(e.target.value); }}>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div><AssessmentSettingsForm form={createForm} dispatch={dispatchCreate} state={createState} onSubmit={createAssessment} t={t} lessons={data.lessons} lessonId={builder.selectedLessonId} onLessonChange={builder.setSelectedLessonId}/></>}</AdminCard>
    <AdminCard><h2>{t('admin.assessmentBuilder.assessmentsTitle', 'Assessments')}</h2>{data.assessments.length === 0 ? <EmptyState message={t('admin.assessmentBuilder.empty', 'No assessments found.')}/> : <table><thead><tr><th>{t('admin.assessmentBuilder.col.title', 'Title')}</th><th>{t('admin.assessmentBuilder.col.score', 'Pass score')}</th><th>{t('admin.assessmentBuilder.col.status', 'Status')}</th><th/></tr></thead><tbody>{data.assessments.map((assessment) => <tr key={assessment.id}><td>{assessment.title}</td><td>{assessment.passingScore}%</td><td><AdminStatusSelect value={assessment.status} statuses={ASSESSMENT_STATUSES} onChange={(status) => void updateStatus(assessment.id, status)}/></td><td><div className="td-actions"><button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => openEdit(assessment)}>{t('admin.assessmentBuilder.edit', 'Edit')}</button><button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => void openQuestions(assessment)}>{t('admin.assessmentBuilder.questions', 'Questions')}</button></div></td></tr>)}</tbody></table>}</AdminCard></section>
    <dialog ref={editDialogRef} className="admin-dialog"><header className="admin-dialog__header"><h2>{t('admin.assessmentBuilder.editTitle', 'Edit assessment')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => editDialogRef.current?.close()}>×</button></header><AssessmentSettingsForm form={editForm} dispatch={dispatchEdit} state={editState} onSubmit={updateAssessment} t={t} editing onCancel={() => editDialogRef.current?.close()}/></dialog>
    <dialog ref={questionsDialogRef} className="admin-dialog" style={{ maxWidth: '720px', width: '100%' }}><header className="admin-dialog__header"><h2>{questionsAssessment?.title} — {t('admin.assessmentBuilder.questionsTitle', 'Questions')}</h2><button className="admin-dialog__close" type="button" aria-label={t('admin.assessmentBuilder.close', 'Close')} onClick={() => questionsDialogRef.current?.close()}>×</button></header><QuestionsEditor assessment={questionsAssessment} courses={data.courses} loading={questionsLoading} questions={questions} setQuestions={setQuestions} options={options} setOptions={setOptions} t={t}/></dialog>
  </AdminPageLayout>;
}

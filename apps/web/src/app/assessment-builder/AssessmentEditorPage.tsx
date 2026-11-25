import { AssessmentMaterialField } from '../../features/assessment-materials/AssessmentMaterial.js';
import { AssessmentQuestionBank } from './AssessmentQuestionBank.js';
import { assessmentPolicySchema, type AssessmentPolicy } from '@lms/shared/assessment-policy';
import { AssessmentPolicyFields } from './AssessmentPolicyFields.js';
import { questionDefinitionSchema } from '@lms/shared/assessment-question-types';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminPageHeader, AdminPageLayout, FormField } from '../../shared/adminPage.js';
import { Badge, Button, ConfirmDialog, PageState } from '../../shared/ui.js';
import { RichTextField } from '../../shared/RichTextField.js';
import { ApiClientError, apiRequest, getCurrentUser } from '../../shared/apiClient.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { formatDate } from '../../shared/formatDate.js';
import { assessmentFormReducer, assessmentToForm, emptyAssessmentForm, mapAssessmentForm } from './model.js';
import { useAssessmentBuilder } from './useAssessmentBuilder.js';
import { AssessmentEditorQuestions } from './AssessmentEditorQuestions.js';
import { AssessmentEditorPreview } from './AssessmentEditorPreview.js';
import type { EditorContent, EditorDocument } from './editorModel.js';
import './assessmentEditor.css';

const tabs = ['questions', 'main', 'settings', 'preview', 'usage'] as const;
type Tab = typeof tabs[number];
type Action = 'save' | 'publish' | 'archive' | 'draft';
const listPath = '/admin/assessments';

export function AssessmentEditorPage() {
  const { assessmentId } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const { state } = useAsyncData(
    (signal) => assessmentId ? apiRequest<EditorDocument>(`/assessments/${assessmentId}/editor`, { signal }) : Promise.resolve(null),
    [assessmentId],
    { unauthenticated: t('admin.assessmentBuilder.sessionExpired'), error: t('admin.assessmentBuilder.loadError') },
  );
  const targetTab = tabs.find((tab) => tab === params.get('tab')) ?? (assessmentId ? 'questions' : 'main');
  const listLink = `${listPath}${params.get('list') ? `?${params.get('list')}` : ''}`;
  const ready = state.status === 'loaded' && (assessmentId ? state.data?.assessment.id === assessmentId : state.data === null);
  const loading = state.status === 'loading' || state.status === 'loaded';
  return <AdminPageLayout brandLabel={t('admin.navLink')} sidebarLabel={t('admin.navLink')}
    navItems={[{ label: t('admin.assessmentBuilder.title'), href: listLink, isCurrent: true }]}>
    {ready ? <Editor key={assessmentId ?? 'new'} initial={state.data} initialTab={targetTab} listLink={listLink} />
      : <PageState variant={loading ? 'loading' : 'error'}
        message={loading ? t('admin.assessmentBuilder.loading') : t('admin.assessmentBuilder.loadError')} />}
  </AdminPageLayout>;
}

function Usage({ document }: { document: EditorDocument }) {
  const { t } = useTranslation();
  if (!document.placements.length && !document.assignments.length) return <p>{t('admin.assessmentBuilder.editor.noUsage')}</p>;
  return <ul>
    {document.placements.map((placement) => <li key={placement.id}>
      {t(`admin.assessmentBuilder.editor.${placement.longreadBlockId ? 'longread' : placement.lesson ? 'lesson' : 'course'}`)}
      {' · '}{[placement.course?.title, placement.lesson?.title].filter(Boolean).join(' / ')}
    </li>)}
    {document.assignments.map(({ userId, user, dueAt }) => <li key={userId}>
      {t('admin.assessmentBuilder.editor.assignment')} · {user.firstName} {user.lastName} · {formatDate(dueAt)}
    </li>)}
  </ul>;
}

function Editor({ initial, initialTab, listLink }: { initial: EditorDocument | null; initialTab: Tab; listLink: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = (key: string) => t(`admin.assessmentBuilder.editor.${key}`);
  const [form, dispatch] = useReducer(assessmentFormReducer, initial, (document) => document
    ? assessmentToForm({ ...document.assessment, ...document.draft?.settings })
    : emptyAssessmentForm());
  const [questions, setQuestions] = useState(initial?.draft?.questions ?? initial?.questions ?? []);
  const [policy, setPolicy] = useState<AssessmentPolicy>(initial?.draft?.settings.policy ?? initial?.assessment.policy ?? {});
  const [material, setMaterial] = useState(initial?.draft?.settings.material === undefined ? initial?.assessment.material : initial.draft.settings.material);
  const [baseline, setBaseline] = useState(() => JSON.stringify({ form, questions, policy, material }));
  const [revision, setRevision] = useState(initial?.assessment.updatedAt);
  const [status, setStatus] = useState(initial?.assessment.status ?? 'draft');
  const [unpublished, setUnpublished] = useState(Boolean(initial?.draft));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [preview, setPreview] = useState({ index: 0, run: 0 });
  const [bankEntryId, setBankEntryId] = useState<string>();
  const [bankError, setBankError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [pending, setPending] = useState<{ action: Action; content: EditorContent; document: EditorDocument } | null>(null);
  const [placementDirty, setPlacementDirty] = useState(false);
  const [copying, setCopying] = useState(false);
  const bypassGuard = useRef(false);
  const snapshot = JSON.stringify({ form, questions, policy, material });
  const dirty = snapshot !== baseline || placementDirty;
  const values = mapAssessmentForm(form, initial?.assessment.slug ?? 'assessment');
  let content: EditorContent | null = null;
  const parsedPolicy = assessmentPolicySchema.safeParse(policy);
  const previousLimits = initial?.draft?.settings ?? initial?.assessment;
  if (values && parsedPolicy.success
    && (values.maxAttempts == null || values.maxAttempts <= 10 || values.maxAttempts === previousLimits?.maxAttempts)
    && (values.timeLimitMinutes == null || values.timeLimitMinutes <= 600 || values.timeLimitMinutes === previousLimits?.timeLimitMinutes)) {
    const { title, description, passingScore, maxAttempts, timeLimitMinutes, availableAfterCourseCompletion,
      passMessage, failMessage, showCorrectAnswers, randomizeOrder } = values;
    content = {
      settings: { title, description, material, passingScore, maxAttempts, timeLimitMinutes: timeLimitMinutes ?? null,
        availableAfterCourseCompletion, passMessage, failMessage, showCorrectAnswers, randomizeOrder,
        ...(Object.keys(parsedPolicy.data).length ? { policy: parsedPolicy.data } : {}) },
      questions,
    };
  }

  const leaveMessage = label('leave');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (bypassGuard.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!link || link.getAttribute('target') === '_blank' || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm(leaveMessage)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      bypassGuard.current = true;
      window.setTimeout(() => { bypassGuard.current = false; }, 0);
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guard, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guard, true);
    };
  }, [dirty, leaveMessage]);

  function change(field: keyof typeof form, value: string | boolean) {
    dispatch({ type: 'change', field, value });
  }

  const endpoint = initial ? `/assessments/${initial.assessment.id}/editor` : null;
  async function save(action: Action, payload: EditorContent, confirmPublished: boolean) {
    if (!endpoint || !revision) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ updatedAt: string; status: string }>(endpoint, {
        method: 'PATCH', body: JSON.stringify({ revision, action, content: payload, confirmPublished }),
      });
      setRevision(result.updatedAt);
      setStatus(result.status);
      setUnpublished(status === 'published' && (action === 'save' || action === 'archive'));
      setBaseline(snapshot);
      setFeedback([]);
    } catch (error) {
      setFeedback([error instanceof ApiClientError && error.status === 409 ? label('conflict') : label('saveError')]);
    } finally {
      setBusy(false);
    }
  }

  async function requestSave(action: Action) {
    const errors: string[] = [];
    if (!content) errors.push(t('assessments.policy.invalidSettings'));
    if (questions.some((question) => !question.title.trim() || !Number.isInteger(question.points) || question.points < 1
      || question.options.some((option) => !option.imageUrl && !option.material && !option.text?.trim()))) errors.push(label('invalidQuestions'));
    for (const question of questions) {
      if (question.definition && !questionDefinitionSchema.safeParse(question.definition).success) {
        errors.push(t('admin.assessmentBuilder.editor.invalidDefinition', { title: question.title }));
      }
    }
    if (action === 'publish') {
      if (!questions.length && !initial?.assessment.bankSampleSize) errors.push(t('admin.assessmentBuilder.publishNoQuestions'));
      for (const question of questions) {
        const count = question.options.filter((option) => option.isCorrect).length;
        if (!question.definition && (!count || (question.type !== 'multiple_choice' && count !== 1))) {
          errors.push(t('admin.assessmentBuilder.editor.missingAnswer', { title: question.title }));
        }
      }
    }
    setFeedback(errors);
    if (errors.length || !content || !endpoint) return;
    if (status !== 'published') {
      await save(action, content, false);
      return;
    }
    setBusy(true);
    try {
      const document = await apiRequest<EditorDocument>(endpoint);
      if (document.assessment.updatedAt !== revision) {
        setFeedback([label('conflict')]);
        return;
      }
      setPending({ action, content, document });
    } catch {
      setFeedback([label('saveError')]);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!initial) return;
    setCopying(true);
    try {
      const result = await apiRequest<{ id: string }>(`/assessments/${initial.assessment.id}/copy`, { method: 'POST' });
      window.location.assign(`${listPath}/${result.id}/edit`);
    } catch {
      setFeedback([t('admin.assessmentBuilder.list.copyError')]);
    } finally {
      setCopying(false);
    }
  }

  function startPreview(index: number) {
    setPreview((previous) => ({ index, run: previous.run + 1 }));
    setTab('preview');
  }

  return <>
    <a href={listLink}>{t('admin.assessmentBuilder.backToDashboard')}</a>
    {dirty && <div className="assessment-editor-footer ui-state ui-state--warning admin-inline-banner">
      <span role="status">{label('unsaved')}</span>
      {initial && <Button type="button" disabled={busy || copying} onClick={() => void requestSave('save')}>{t('admin.assessmentBuilder.update')}</Button>}
    </div>}
    <AdminPageHeader title={form.title.trim() || t(initial ? 'admin.assessmentBuilder.editTitle' : 'admin.assessmentBuilder.createTitle')}
      subtitle={<>
        <Badge variant={status === 'published' ? 'published' : status === 'draft' ? 'draft' : 'neutral'}>{t(`admin.assessmentBuilder.status.${status}`)}</Badge>
        {unpublished && <> <Badge variant="draft">{label('unpublished')}</Badge></>}
      </>}
      action={<div className="admin-header-actions">
        {initial && <Button variant="secondary" type="button" disabled={dirty || busy || copying} onClick={() => void copy()}>{t('admin.checklists.copy')}</Button>}
        {initial && <Button variant="secondary" type="button" onClick={() => startPreview(0)}>{label('previewFromStart')}</Button>}
        {!initial && <Button variant="primary" type="submit" form="assessment-editor-create">{t('admin.assessmentBuilder.create')}</Button>}
        {initial && <>
          <Button variant="primary" type="button" disabled={busy || copying || (status === 'published' && !dirty && !unpublished)}
            onClick={() => void requestSave('publish')}>{t('admin.assessmentBuilder.publish')}</Button>
          {status !== 'draft' && <Button variant="secondary" type="button" disabled={busy || copying}
            onClick={() => void requestSave('draft')}>{label('returnToDraft')}</Button>}
          {status !== 'archived' && <Button variant="secondary" type="button" disabled={busy || copying}
            onClick={() => void requestSave('archive')}>{t('admin.checklists.action.archive')}</Button>}
        </>}
      </div>} />
    <nav className="admin-builder-tabbar__actions" aria-label={t('admin.assessmentBuilder.editTitle')}>
      {tabs.filter((item) => initial || item === 'main' || item === 'settings').map((item) =>
        <Button key={item} type="button" aria-pressed={tab === item} variant={tab === item ? 'primary' : 'secondary'}
          onClick={() => setTab(item)}>{label(item)}</Button>)}
    </nav>
    <fieldset disabled={busy || copying || pending !== null} className={`admin-theme-settings__fieldset admin-form ${tab === 'questions' ? '' : 'assessment-editor-panel'}`}>
      {!initial && <div hidden={tab !== 'main'}><CreationPlacement onChange={() => setPlacementDirty(true)} form={form} policy={policy} onCreated={(id) => {
          const params = new URLSearchParams({ tab: 'questions' });
          if (listLink.includes('?')) params.set('list', listLink.split('?')[1]);
          navigate(`${listPath}/${id}/edit?${params}`, { replace: true });
        }} onError={setFeedback} /></div>}
      {tab === 'main' && <>
        <FormField id="assessment-editor-title" label={t('admin.assessmentBuilder.assessmentTitle')} required>
          <input id="assessment-editor-title" value={form.title} maxLength={200} onChange={(event) => change('title', event.target.value)} />
        </FormField>
        <FormField id="timeLimitMinutes" label={label('timeLimit')} hint={label('timeHint')}>
          <input id="timeLimitMinutes" type="number" min={1} max={Math.max(600, previousLimits?.timeLimitMinutes ?? 0)} value={form.timeLimitMinutes}
            onChange={(event) => change('timeLimitMinutes', event.target.value)} />
        </FormField>
        <RichTextField id="assessment-editor-description" label={t('admin.assessmentBuilder.description')}
          value={form.description} maxLength={2000} onChange={(value) => change('description', value)} />
        <AssessmentMaterialField value={material} onChange={setMaterial} />
      </>}
      {tab === 'settings' && <>
        <AssessmentPolicyFields policy={policy} onChange={setPolicy} legacyReveal={form.showCorrectAnswers} />
        {([
          ['passingScore', t('admin.assessmentBuilder.passingScore'), 0, 100],
          ['maxAttempts', t('admin.assessmentBuilder.maxAttempts'), 1, Math.max(10, previousLimits?.maxAttempts ?? 0)],
        ] as const).map(([field, title, min, max]) => <FormField key={field} id={field} label={title}>
          <input id={field} type="number" min={min} max={max} value={form[field]} onChange={(event) => change(field, event.target.value)} />
        </FormField>)}
        {(['availableAfterCourseCompletion', 'randomizeOrder'] as const).map((field) =>
          <label key={field} className="admin-checkbox-field">
            <input type="checkbox" checked={form[field]} onChange={(event) => change(field, event.target.checked)} />
            {t(`admin.assessmentBuilder.${field === 'availableAfterCourseCompletion' ? 'availableAfterCompletion' : field}`)}
          </label>)}
        {(['passMessage', 'failMessage'] as const).map((field) => <RichTextField key={field} id={field}
          label={t(`admin.assessmentBuilder.${field}`)} value={form[field]} maxLength={2000} onChange={(value) => change(field, value)} />)}
      </>}
      {tab === 'questions' && <>
        <AssessmentEditorQuestions questions={questions} onChange={setQuestions} onPreview={startPreview} onEditBank={setBankEntryId}
          onDetachBank={dirty || busy ? undefined : (id) => {
            setBankError(false);
            setBusy(true);
            void apiRequest(`/questions/${id}/detach-bank`, { method: 'POST' }).then(() => window.location.reload(), () => {
              setBankError(true);
              setBusy(false);
            });
          }} />
        {bankError && <p role="alert">{t('questionBank.error')}</p>}
        {initial && <AssessmentQuestionBank assessmentId={initial.assessment.id} disabled={dirty}
          selectedId={bankEntryId} changed={() => window.location.reload()} />}
      </>}
      {tab === 'preview' && initial && <>
        <AssessmentEditorPreview key={preview.run} assessment={initial.assessment} content={content} startIndex={preview.index} />
      </>}
      {tab === 'usage' && initial && <Usage document={initial} />}
    </fieldset>
    {feedback.length > 0 && <ul role="alert" className="admin-form__error">{feedback.map((message, index) => <li key={index}>{message}</li>)}</ul>}
    <ConfirmDialog open={pending !== null} title={label('confirmTitle')}
      message={pending && <div><p>{label(pending.document.hasAttempts ? 'confirmWithAttempts' : 'confirmText')}</p><Usage document={pending.document} /></div>}
      confirmLabel={label('confirm')} cancelLabel={t('admin.assessmentBuilder.cancel')}
      onCancel={() => setPending(null)} onConfirm={() => {
        if (!pending) return;
        setPending(null);
        void save(pending.action, pending.content, true);
      }} />
  </>;
}

function CreationPlacement({ onChange, form, policy, onCreated, onError }: {
  onChange: () => void;
  form: ReturnType<typeof emptyAssessmentForm>;
  policy: AssessmentPolicy;
  onCreated: (id: string) => void;
  onError: (errors: string[]) => void;
}) {
  const { t } = useTranslation();
  const { loadState, selectedCourseId, selectedLessonId, selectCourse, setSelectedLessonId } = useAssessmentBuilder(t);
  const [standalone, setStandalone] = useState(false);
  const [saving, setSaving] = useState(false);
  const courses = loadState.status === 'loaded' ? loadState.courses : [];
  const course = courses.find((item) => item.id === selectedCourseId);
  const independent = standalone || !courses.length;
  return <form id="assessment-editor-create" className="admin-form" onSubmit={async (event) => {
    event.preventDefault();
    if (saving || loadState.status !== 'loaded') return;
    const values = mapAssessmentForm(form, `assessment-${crypto.randomUUID()}`);
    const parsed = assessmentPolicySchema.safeParse(policy);
    if (!values || !parsed.success || (values.maxAttempts ?? 0) > 10 || (values.timeLimitMinutes ?? 0) > 600) {
      onError([t('assessments.policy.invalidSettings')]);
      return;
    }
    setSaving(true);
    onError([]);
    try {
      const organizationId = independent ? (await getCurrentUser()).organizationId : course?.organizationId;
      const result = await apiRequest<{ id: string }>('/assessments', {
        method: 'POST',
        body: JSON.stringify({
          ...values, ...(Object.keys(parsed.data).length ? { policy: parsed.data } : {}), organizationId, status: 'draft', description: values.description ?? undefined,
          maxAttempts: values.maxAttempts ?? undefined, passMessage: values.passMessage ?? undefined, failMessage: values.failMessage ?? undefined,
          courseId: independent ? undefined : selectedCourseId, lessonId: independent ? undefined : selectedLessonId || undefined,
        }),
      });
      onCreated(result.id);
    } catch (error) {
      onError([t(error instanceof ApiClientError && error.status === 409
        ? 'admin.assessmentBuilder.assessmentExists' : 'admin.assessmentBuilder.saveError')]);
    } finally {
      setSaving(false);
    }
  }}>
    {loadState.status !== 'loaded' ? <PageState variant={loadState.status === 'loading' ? 'loading' : 'error'}
      message={loadState.status === 'loading' ? t('admin.assessmentBuilder.loading') : loadState.message} /> : <>
      <label className="admin-checkbox-field">
        <input type="checkbox" checked={independent} disabled={!courses.length || saving} onChange={(event) => {
          setStandalone(event.target.checked);
          onChange();
        }} />{t('assessments.standalone.label')}
      </label>
      {!independent && <>
        <FormField id="assessment-editor-course" label={t('admin.assessmentBuilder.course')}>
          <select id="assessment-editor-course" value={selectedCourseId} onChange={(event) => { selectCourse(event.target.value); onChange(); }}>
            {courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </FormField>
        <FormField id="assessment-editor-lesson" label={t('admin.assessmentBuilder.lesson')}>
          <select id="assessment-editor-lesson" value={selectedLessonId} onChange={(event) => { setSelectedLessonId(event.target.value); onChange(); }}>
            <option value="">{t('admin.assessmentBuilder.noLesson')}</option>
            {loadState.lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </FormField>
      </>}
    </>}
  </form>;
}

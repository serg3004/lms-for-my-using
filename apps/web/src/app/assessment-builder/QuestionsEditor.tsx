import { type FormEvent, useState } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError, apiRequest } from '../../shared/apiClient.js';
import { ConfirmDialog } from '../../shared/adminPage.js';
import { appendOption, removeOption, replaceOption, type AnswerOption, type Assessment, type Course, type Question, type QuestionType } from './model.js';

type Props = { assessment: Assessment | null; courses: Course[]; loading: boolean; questions: Question[]; setQuestions: React.Dispatch<React.SetStateAction<Question[]>>; options: Record<string, AnswerOption[]>; setOptions: React.Dispatch<React.SetStateAction<Record<string, AnswerOption[]>>>; t: TFunction };
export function QuestionsEditor({ assessment, courses, loading, questions, setQuestions, options, setOptions, t }: Props) {
  const [title, setTitle] = useState(''); const [type, setType] = useState<QuestionType>('single_choice'); const [points, setPoints] = useState('1');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [optionFor, setOptionFor] = useState<string | null>(null);
  const [optionText, setOptionText] = useState(''); const [correct, setCorrect] = useState(false); const [optionSaving, setOptionSaving] = useState(false); const [optionError, setOptionError] = useState<string | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionTitle, setEditQuestionTitle] = useState(''); const [editQuestionType, setEditQuestionType] = useState<QuestionType>('single_choice'); const [editQuestionPoints, setEditQuestionPoints] = useState('1');
  const [questionEditSaving, setQuestionEditSaving] = useState(false); const [questionEditError, setQuestionEditError] = useState<string | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<Question | null>(null); const [deletingQuestion, setDeletingQuestion] = useState(false);

  const [editingOption, setEditingOption] = useState<{ questionId: string; optionId: string } | null>(null);
  const [editOptionText, setEditOptionText] = useState(''); const [editOptionCorrect, setEditOptionCorrect] = useState(false);
  const [optionEditSaving, setOptionEditSaving] = useState(false); const [optionEditError, setOptionEditError] = useState<string | null>(null);
  const [deleteOptionTarget, setDeleteOptionTarget] = useState<{ questionId: string; option: AnswerOption } | null>(null); const [deletingOption, setDeletingOption] = useState(false);

  async function addQuestion(event: FormEvent) { event.preventDefault(); if (!assessment || !title.trim()) return; setSaving(true); setError(null); try { const created = await apiRequest<Question>(`/assessments/${encodeURIComponent(assessment.id)}/questions`, { method: 'POST', body: JSON.stringify({ organizationId: courses[0]?.organizationId ?? '', type, title: title.trim(), points: Number(points) || 1, order: questions.length }) }); setQuestions((items) => [...items, created]); setOptions((items) => ({ ...items, [created.id]: [] })); setTitle(''); setPoints('1'); } catch (reason) { setError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.questionSaveError', 'Failed to add question.')); } finally { setSaving(false); } }
  async function addOption(questionId: string, event: FormEvent) { event.preventDefault(); if (!optionText.trim()) return; setOptionSaving(true); setOptionError(null); try { const created = await apiRequest<AnswerOption>(`/questions/${encodeURIComponent(questionId)}/options`, { method: 'POST', body: JSON.stringify({ organizationId: courses[0]?.organizationId ?? '', text: optionText.trim(), isCorrect: correct, order: options[questionId]?.length ?? 0 }) }); setOptions((items) => appendOption(items, questionId, created)); setOptionText(''); setCorrect(false); setOptionFor(null); } catch (reason) { setOptionError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.optionSaveError', 'Failed to add option.')); } finally { setOptionSaving(false); } }

  function startEditQuestion(question: Question) { setEditingQuestionId(question.id); setEditQuestionTitle(question.title); setEditQuestionType(question.type); setEditQuestionPoints(String(question.points)); setQuestionEditError(null); }
  function cancelEditQuestion() { setEditingQuestionId(null); setQuestionEditError(null); }
  async function saveEditQuestion(questionId: string, event: FormEvent) {
    event.preventDefault();
    if (!editQuestionTitle.trim()) return;
    setQuestionEditSaving(true); setQuestionEditError(null);
    try {
      const updated = await apiRequest<Question>(`/questions/${encodeURIComponent(questionId)}`, { method: 'PATCH', body: JSON.stringify({ title: editQuestionTitle.trim(), type: editQuestionType, points: Number(editQuestionPoints) || 1 }) });
      setQuestions((items) => items.map((item) => (item.id === questionId ? updated : item)));
      setEditingQuestionId(null);
    } catch (reason) {
      setQuestionEditError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.questionUpdateError', 'Failed to update question.'));
    } finally {
      setQuestionEditSaving(false);
    }
  }
  async function confirmDeleteQuestion() {
    if (!deleteQuestionTarget) return;
    setDeletingQuestion(true);
    try {
      await apiRequest(`/questions/${encodeURIComponent(deleteQuestionTarget.id)}`, { method: 'DELETE' });
      setQuestions((items) => items.filter((item) => item.id !== deleteQuestionTarget.id));
      setOptions((items) => { const next = { ...items }; delete next[deleteQuestionTarget.id]; return next; });
      setDeleteQuestionTarget(null);
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.questionDeleteError', 'Failed to delete question.'));
      setDeleteQuestionTarget(null);
    } finally {
      setDeletingQuestion(false);
    }
  }

  function startEditOption(questionId: string, option: AnswerOption) { setEditingOption({ questionId, optionId: option.id }); setEditOptionText(option.text ?? ''); setEditOptionCorrect(option.isCorrect); setOptionEditError(null); }
  function cancelEditOption() { setEditingOption(null); setOptionEditError(null); }
  async function saveEditOption(questionId: string, optionId: string, event: FormEvent) {
    event.preventDefault();
    if (!editOptionText.trim()) return;
    setOptionEditSaving(true); setOptionEditError(null);
    try {
      const updated = await apiRequest<AnswerOption>(`/questions/${encodeURIComponent(questionId)}/options/${encodeURIComponent(optionId)}`, { method: 'PATCH', body: JSON.stringify({ text: editOptionText.trim(), isCorrect: editOptionCorrect }) });
      setOptions((items) => replaceOption(items, questionId, updated));
      setEditingOption(null);
    } catch (reason) {
      setOptionEditError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.optionUpdateError', 'Failed to update option.'));
    } finally {
      setOptionEditSaving(false);
    }
  }
  async function confirmDeleteOption() {
    if (!deleteOptionTarget) return;
    setDeletingOption(true);
    try {
      await apiRequest(`/questions/${encodeURIComponent(deleteOptionTarget.questionId)}/options/${encodeURIComponent(deleteOptionTarget.option.id)}`, { method: 'DELETE' });
      setOptions((items) => removeOption(items, deleteOptionTarget.questionId, deleteOptionTarget.option.id));
      setDeleteOptionTarget(null);
    } catch (reason) {
      setOptionError(reason instanceof ApiClientError ? reason.message : t('admin.assessmentBuilder.optionDeleteError', 'Failed to delete option.'));
      setDeleteOptionTarget(null);
    } finally {
      setDeletingOption(false);
    }
  }

  if (loading) return <p style={{ padding: '16px', color: 'var(--color-text-muted)' }}>{t('admin.assessmentBuilder.questionsLoading', 'Loading questions...')}</p>;
  return <div style={{ padding: '0 0 16px' }}>
    {questions.length === 0 ? <p style={{ padding: '12px 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>{t('admin.assessmentBuilder.noQuestions', 'No questions yet.')}</p> : <ol style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: '12px' }}>{questions.map((question, index) => <li key={question.id} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
      {editingQuestionId === question.id ? (
        <form style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'end' }} onSubmit={(event) => void saveEditQuestion(question.id, event)}>
          <div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.questionTitle', 'Question text')}</label><input value={editQuestionTitle} onChange={(e) => setEditQuestionTitle(e.target.value)} maxLength={200}/></div>
          <div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.questionType', 'Type')}</label><select value={editQuestionType} onChange={(e) => setEditQuestionType(e.target.value as QuestionType)}><option value="single_choice">{t('admin.assessmentBuilder.singleChoice', 'Single choice')}</option><option value="multiple_choice">{t('admin.assessmentBuilder.multipleChoice', 'Multiple choice')}</option><option value="true_false">{t('admin.assessmentBuilder.trueFalse', 'True / False')}</option></select></div>
          <div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.points', 'Points')}</label><input value={editQuestionPoints} onChange={(e) => setEditQuestionPoints(e.target.value)} inputMode="numeric" style={{ width: '60px' }}/></div>
          {questionEditError ? <p className="admin-form__error" role="alert" style={{ gridColumn: '1 / -1', margin: 0 }}>{questionEditError}</p> : null}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
            <button className="admin-btn admin-btn--sm admin-btn--primary" type="submit" disabled={questionEditSaving}>{questionEditSaving ? t('admin.assessmentBuilder.updating', 'Saving...') : t('admin.assessmentBuilder.update', 'Save changes')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={cancelEditQuestion}>{t('admin.assessmentBuilder.cancel', 'Cancel')}</button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div><span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginRight: '8px' }}>{index + 1}. [{question.type}] {question.points}pt</span><strong style={{ fontSize: '14px' }}>{question.title}</strong></div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => { setOptionFor(optionFor === question.id ? null : question.id); setOptionText(''); setCorrect(false); setOptionError(null); }}>+ {t('admin.assessmentBuilder.addOption', 'Add option')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => startEditQuestion(question)}>{t('admin.assessmentBuilder.edit', 'Edit')}</button>
            <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setDeleteQuestionTarget(question)}>{t('admin.assessmentBuilder.delete', 'Delete')}</button>
          </div>
        </div>
      )}
      {(options[question.id] ?? []).length ? <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: '13px', display: 'grid', gap: '6px' }}>{options[question.id].map((option) => (
        <li key={option.id}>
          {editingOption?.questionId === question.id && editingOption.optionId === option.id ? (
            <form style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(event) => void saveEditOption(question.id, option.id, event)}>
              <input style={{ flex: 1, minWidth: '160px' }} value={editOptionText} onChange={(e) => setEditOptionText(e.target.value)} maxLength={500}/>
              <label style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={editOptionCorrect} onChange={(e) => setEditOptionCorrect(e.target.checked)}/>{t('admin.assessmentBuilder.correct', 'Correct')}</label>
              <button className="admin-btn admin-btn--sm admin-btn--primary" type="submit" disabled={optionEditSaving}>{optionEditSaving ? t('admin.assessmentBuilder.updating', 'Saving...') : t('admin.assessmentBuilder.update', 'Save changes')}</button>
              <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={cancelEditOption}>{t('admin.assessmentBuilder.cancel', 'Cancel')}</button>
              {optionEditError ? <p className="admin-form__error" role="alert" style={{ width: '100%', margin: 0 }}>{optionEditError}</p> : null}
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: option.isCorrect ? 'var(--color-success)' : 'inherit' }}>{option.isCorrect ? '✓ ' : '○ '}{option.text}</span>
              <button className="admin-btn admin-btn--sm admin-btn--secondary" type="button" onClick={() => startEditOption(question.id, option)}>{t('admin.assessmentBuilder.edit', 'Edit')}</button>
              <button className="admin-btn admin-btn--sm admin-btn--danger" type="button" onClick={() => setDeleteOptionTarget({ questionId: question.id, option })}>{t('admin.assessmentBuilder.delete', 'Delete')}</button>
            </div>
          )}
        </li>
      ))}</ul> : null}
      {optionFor === question.id ? <form style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(event) => void addOption(question.id, event)}><input style={{ flex: 1, minWidth: '160px' }} placeholder={t('admin.assessmentBuilder.optionText', 'Option text')} value={optionText} onChange={(e) => setOptionText(e.target.value)} maxLength={500}/><label style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={correct} onChange={(e) => setCorrect(e.target.checked)}/>{t('admin.assessmentBuilder.correct', 'Correct')}</label><button className="admin-btn admin-btn--sm admin-btn--primary" type="submit" disabled={optionSaving}>{optionSaving ? '...' : t('admin.assessmentBuilder.addOption', 'Add option')}</button>{optionError ? <p className="admin-form__error" role="alert" style={{ width: '100%', margin: 0 }}>{optionError}</p> : null}</form> : null}</li>)}</ol>}
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>{t('admin.assessmentBuilder.addQuestion', 'Add question')}</h3><form className="admin-form" onSubmit={(event) => void addQuestion(event)}><div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'end' }}><div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.questionTitle', 'Question text')}</label><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}/></div><div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.questionType', 'Type')}</label><select value={type} onChange={(e) => setType(e.target.value as QuestionType)}><option value="single_choice">{t('admin.assessmentBuilder.singleChoice', 'Single choice')}</option><option value="multiple_choice">{t('admin.assessmentBuilder.multipleChoice', 'Multiple choice')}</option><option value="true_false">{t('admin.assessmentBuilder.trueFalse', 'True / False')}</option></select></div><div className="admin-form__field" style={{ margin: 0 }}><label>{t('admin.assessmentBuilder.points', 'Points')}</label><input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" style={{ width: '60px' }}/></div></div>{error ? <p className="admin-form__error" role="alert" style={{ marginTop: '8px' }}>{error}</p> : null}<div className="admin-form__actions" style={{ marginTop: '12px' }}><button className="admin-btn admin-btn--primary" type="submit" disabled={saving}>{saving ? t('admin.assessmentBuilder.saving', 'Creating...') : t('admin.assessmentBuilder.addQuestionBtn', 'Add question')}</button></div></form></div>

    <ConfirmDialog
      open={deleteQuestionTarget !== null}
      title={t('admin.assessmentBuilder.deleteQuestionTitle', 'Delete question')}
      message={t('admin.assessmentBuilder.deleteQuestionConfirm', 'Delete "{{title}}"? This also removes its answer options.', { title: deleteQuestionTarget?.title ?? '' })}
      confirmLabel={deletingQuestion ? t('admin.assessmentBuilder.deleting', 'Deleting...') : t('admin.assessmentBuilder.delete', 'Delete')}
      cancelLabel={t('admin.assessmentBuilder.cancel', 'Cancel')}
      variant="danger"
      onConfirm={() => void confirmDeleteQuestion()}
      onCancel={() => setDeleteQuestionTarget(null)}
    />
    <ConfirmDialog
      open={deleteOptionTarget !== null}
      title={t('admin.assessmentBuilder.deleteOptionTitle', 'Delete option')}
      message={t('admin.assessmentBuilder.deleteOptionConfirm', 'Delete "{{text}}"?', { text: deleteOptionTarget?.option.text ?? '' })}
      confirmLabel={deletingOption ? t('admin.assessmentBuilder.deleting', 'Deleting...') : t('admin.assessmentBuilder.delete', 'Delete')}
      cancelLabel={t('admin.assessmentBuilder.cancel', 'Cancel')}
      variant="danger"
      onConfirm={() => void confirmDeleteOption()}
      onCancel={() => setDeleteOptionTarget(null)}
    />
  </div>;
}

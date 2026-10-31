import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { questionTypeSchema, questionDefinitionSchema, type QuestionType } from '@lms/shared/assessment-question-types';
import { exerciseContentSchema, writeLongreadQuestionSchema, type ExerciseContent, type WriteLongreadQuestion } from '@lms/shared/longread-exercises';
import { getLongreadQuestionBank, writeLongreadQuestion, type LongreadQuestionBank } from '../../shared/api/longreads.js';
import { QuestionAuthorFields } from './QuestionAuthorFields.js';
import { exerciseError } from './ExerciseRuntime.js';
function emptyQuestion(type: QuestionType): WriteLongreadQuestion {
  const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID(), d = crypto.randomUUID();
  const definitions = {
    true_false: { type, correctAnswer: true },
    matching: { type, left: [{ id: a, text: '' }, { id: b, text: '' }], right: [{ id: c, text: '' }, { id: d, text: '' }], correctPairs: [{ leftId: a, rightId: c }, { leftId: b, rightId: d }] },
    ordering: { type, items: [{ id: a, text: '' }, { id: b, text: '' }], correctOrder: [a, b] },
    fill_blank: { type, blanks: [{ id: 'blank-1', acceptedAnswers: [''] }], caseSensitive: false, whitespace: 'trim' },
    short_answer: { type, acceptedAnswers: [''], caseSensitive: false, whitespace: 'trim' },
  };
  return { type, title: '', text: '', scoringMode: 'all_or_nothing', definition: (definitions[type as keyof typeof definitions] ?? null) as WriteLongreadQuestion['definition'],
    options: ['single_choice', 'multiple_choice'].includes(type) ? [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] : [], assessmentPassingScore: 70, assessmentMaxAttempts: null };
}
export function ExerciseEditor({ lessonId, content, onChange, ready, revision, adoptRevision, onBusy }: {
  lessonId: string; content: Record<string, unknown>; onChange: (content: Record<string, unknown>) => void;
  ready: boolean; revision: () => number; adoptRevision: (revision: number) => void; onBusy: (busy: boolean) => void;
}) {
  const { t } = useTranslation(), id = useId();
  const [bank, setBank] = useState<LongreadQuestionBank>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [form, setForm] = useState<WriteLongreadQuestion | null>(null), [saving, setSaving] = useState(false);
  const config = { ...exerciseContentSchema.parse({}), ...content } as ExerciseContent;
  const parent = bank.find((a) => a.questions.some((q) => q.id === config.questionId)), linked = parent?.questions.find((q) => q.id === config.questionId);
  useEffect(() => {
    let active = true;
    const load = () => { void getLongreadQuestionBank(lessonId).then((value) => { if (active) setBank(value); }).catch((cause) => { if (active) setError(exerciseError(cause)); }).finally(() => { if (active) setLoading(false); }); };
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === lessonId) load(); };
    setLoading(true); load(); window.addEventListener('longread-question-bank-change', changed);
    return () => { active = false; window.removeEventListener('longread-question-bank-change', changed); };
  }, [lessonId]);
  const patch = (value: Record<string, unknown>) => onChange({ ...config, ...value });
  const number = (key: 'weight' | 'maxAttempts' | 'passingScore', min: number, max: number) => <label style={{ display: 'block', marginBlock: 8 }} htmlFor={`${id}-${key}`}>{t(`longreadExercises.${key === 'passingScore' ? 'passingScoreLabel' : key}`)}<input id={`${id}-${key}`} type="number" min={min} max={max} value={Number.isFinite(config[key]) ? config[key] : ''} onChange={(e) => patch({ [key]: e.target.valueAsNumber })} /></label>;
  const valid = form && writeLongreadQuestionSchema.safeParse(form).success && (!form.definition || questionDefinitionSchema.safeParse(form.definition).success)
    && (form.definition ? form.options.length === 0 : form.options.length >= 2 && form.options.some((o) => o.isCorrect) && (form.type === 'multiple_choice' || form.options.filter((o) => o.isCorrect).length === 1));
  async function save() {
    if (!ready || !valid || !form || saving) return;
    setSaving(true); onBusy(true); setError('');
    try {
      const result = await writeLongreadQuestion(lessonId, revision(), form);
      adoptRevision(result.revision); patch({ questionId: result.questionId }); setForm(null);
      setBank(await getLongreadQuestionBank(lessonId)); window.dispatchEvent(new CustomEvent('longread-question-bank-change', { detail: lessonId }));
    } catch (cause) { setError(exerciseError(cause)); }
    finally { setSaving(false); onBusy(false); }
  }
  return <fieldset disabled={saving} style={{ minWidth: 0, border: 0, padding: 0 }}><legend>{t('longreadExercises.editor')}</legend>
    <p>{t('longreadExercises.snapshotHelp')}</p>
    {loading && <p role="status">{t('longreadExercises.loading')}</p>}
    <label htmlFor={`${id}-question`}>{t('longreadExercises.linkQuestion')}</label>
    <select id={`${id}-question`} value={config.questionId ?? ''} style={{ width: '100%', minHeight: 44 }} onChange={(e) => { patch({ questionId: e.target.value || null }); setForm(null); }}>
      <option value="">{t('longreadExercises.selectQuestion')}</option>
      {config.questionId && !linked && <option value={config.questionId}>{t('longreadExercises.unavailable')}</option>}
      {bank.map((assessment) => <optgroup key={assessment.id} label={assessment.title}>{assessment.questions.map((q) => <option key={q.id} value={q.id}>{q.title} · {t(`longreadExercises.types.${q.type}`)}</option>)}</optgroup>)}
    </select>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlock: 12 }}>
      <button type="button" className="admin-btn admin-btn--secondary" disabled={!ready} onClick={() => setForm(emptyQuestion('single_choice'))}>{t('longreadExercises.createQuestion')}</button>
      {linked && <button type="button" className="admin-btn admin-btn--secondary" disabled={!ready || linked.options.some((o) => o.imageUrl)} onClick={() => {
        let definition = linked.definition;
        if (definition?.type === 'matching') { const d = definition; definition = { ...d, right: d.left.map((left) => d.right.find((right) => right.id === d.correctPairs.find((p) => p.leftId === left.id)!.rightId)!) }; }
        setForm({ questionId: linked.id, assessmentId: parent!.id, updatedAt: linked.updatedAt, type: linked.type, title: linked.title, text: linked.text ?? '', definition, scoringMode: linked.scoringMode,
          options: linked.options.map((o) => ({ id: o.id, text: o.text ?? '', isCorrect: o.isCorrect })), assessmentPassingScore: parent!.passingScore, assessmentMaxAttempts: parent!.maxAttempts });
      }}>{t('longreadExercises.editQuestion')}</button>}
    </div>
    {linked?.options.some((o) => o.imageUrl) && <p>{t('longreadExercises.imageOptionsHelp')}</p>}
    {!ready && <p role="status">{t('longreadExercises.waitSaved')}</p>}
    {form && <section style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }} aria-label={t('longreadExercises.questionForm')}>
      <label htmlFor={`${id}-type`}>{t('longreadExercises.questionType')}</label><select id={`${id}-type`} value={form.type} onChange={(e) => setForm({ ...emptyQuestion(e.target.value as QuestionType), ...(form.questionId ? { questionId: form.questionId, assessmentId: form.assessmentId, updatedAt: form.updatedAt } : {}), title: form.title, text: form.text, assessmentPassingScore: form.assessmentPassingScore, assessmentMaxAttempts: form.assessmentMaxAttempts })}>{questionTypeSchema.options.map((type) => <option value={type} key={type}>{t(`longreadExercises.types.${type}`)}</option>)}</select>
      <label style={{ display: 'block' }}>{t('longreadExercises.title')}<input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label style={{ display: 'block' }}>{t('longreadExercises.text')}<textarea value={form.text} maxLength={4000} onChange={(e) => setForm({ ...form, text: e.target.value })} /></label>
      <QuestionAuthorFields value={form} onChange={setForm} />
      <label style={{ display: 'block' }}>{t('longreadExercises.scoringMode')}<select value={form.scoringMode} onChange={(e) => setForm({ ...form, scoringMode: e.target.value as WriteLongreadQuestion['scoringMode'] })}><option value="all_or_nothing">{t('longreadExercises.allOrNothing')}</option><option value="proportional">{t('longreadExercises.partialScoring')}</option><option value="proportional_with_penalty">{t('longreadExercises.penaltyScoring')}</option><option value="per_option">{t('longreadExercises.perOptionScoring')}</option></select></label>
      <label style={{ display: 'block' }}>{t('longreadExercises.testPassingScore')}<input type="number" min={0} max={100} value={form.assessmentPassingScore} onChange={(e) => setForm({ ...form, assessmentPassingScore: e.target.valueAsNumber })} /></label>
      <label style={{ display: 'block' }}>{t('longreadExercises.testMaxAttempts')}<input type="number" min={1} max={100} value={form.assessmentMaxAttempts ?? ''} onChange={(e) => setForm({ ...form, assessmentMaxAttempts: e.target.value === '' ? null : e.target.valueAsNumber })} /></label>
      <p>{t('longreadExercises.parentSettingsHelp')}</p>
      {!valid && <p role="status">{t('longreadExercises.questionInvalid')}</p>}
      <button type="button" className="admin-btn admin-btn--primary" disabled={!ready || !valid || saving} onClick={() => void save()}>{t(saving ? 'longreadExercises.sending' : 'longreadExercises.saveQuestion')}</button>{' '}
      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setForm(null)}>{t('longread.close')}</button>
    </section>}
    <label style={{ display: 'block' }}>{t('longreadExercises.mode')}<select value={config.mode} onChange={(e) => patch({ mode: e.target.value })}><option value="practice">{t('longreadExercises.practice')}</option><option value="graded">{t('longreadExercises.graded')}</option></select></label>
    <label><input type="checkbox" checked={config.required} onChange={(e) => patch({ required: e.target.checked })} /> {t('longreadExercises.required')}</label>
    {number('weight', 1, 1_000_000)}{number('maxAttempts', 1, 100)}{number('passingScore', 0, 100)}
    <label style={{ display: 'block' }}>{t('longreadExercises.hint')}<textarea maxLength={2000} value={config.hint} onChange={(e) => patch({ hint: e.target.value })} /></label>
    <label style={{ display: 'block' }}>{t('longreadExercises.feedback')}<select value={config.feedback} onChange={(e) => patch({ feedback: e.target.value })}><option value="result">{t('longreadExercises.feedbackResult')}</option><option value="answers">{t('longreadExercises.feedbackAnswers')}</option></select></label>
    {error && <p role="alert">{t(error)}</p>}
  </fieldset>;
}

import { ApiClientError } from '../../shared/apiClient.js';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assessmentAnswerSchema, type AssessmentAnswer } from '@lms/shared/assessment-question-types';
import { exerciseContentSchema, publicExerciseQuestionSchema, type ExerciseResult } from '@lms/shared/longread-exercises';
import type { ReaderBlock } from '../../shared/api/longreads.js';
import { QuestionResponseFields, exerciseAnswerComplete } from './QuestionResponseFields.js';
import { useExerciseRuntime, exerciseError } from './ExerciseRuntime.js';
import { correctAnswerText } from './answer-text.js';

type Pending = { requestId: string; expectedAttempt: number; answer: AssessmentAnswer };
export function ExerciseBlock({ block }: { block: ReaderBlock }) {
  const { t } = useTranslation(), runtime = useExerciseRuntime();
  const [answer, setAnswer] = useState<AssessmentAnswer | null>(null), [localResult, setLocalResult] = useState<ExerciseResult | null>(null);
  const [editing, setEditing] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<Pending | null>(null), inFlight = useRef(false), handled = useRef<string | undefined>(undefined);
  const content = exerciseContentSchema.safeParse(block.content), parsed = publicExerciseQuestionSchema.safeParse(block.question);
  const state = runtime?.state?.exercises.find((value) => value.blockId === block.id), last = state?.lastResult;
  const storageKey = runtime?.userId && !runtime.preview ? `lr-exercise:${runtime.userId}:${runtime.lessonId}:${runtime.version}:${block.id}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey); if (!raw) return;
      const value = JSON.parse(raw) as Pending;
      const valid = assessmentAnswerSchema.safeParse(value.answer);
      if (valid.success && typeof value.requestId === 'string' && Number.isInteger(value.expectedAttempt)) { pending.current = { ...value, answer: valid.data }; setAnswer(valid.data); }
    } catch { /* Storage is optional; server attempt counters remain authoritative. */ }
  }, [storageKey]);
  useEffect(() => {
    if (!last || last.attemptId === handled.current) return;
    handled.current = last.attemptId;
    setEditing(false); setLocalResult(last); setAnswer(last.answer ?? null); pending.current = null;
    if (storageKey) try { sessionStorage.removeItem(storageKey); } catch { /* Optional retry cache. */ }
  }, [last, storageKey]);
  if (!runtime || !content.success || !parsed.success || !block.id) return <p role="note">{t('longreadReader.unsupported')}</p>;
  const question = parsed.data, config = content.data, result = localResult ?? last;
  const blocked = !runtime.preview && (!state || !state.remaining || state.testExhausted);
  async function submit() {
    if (inFlight.current || !answer || !exerciseAnswerComplete(question, answer) || !runtime || !block.id) return;
    inFlight.current = true; setBusy(true); setError('');
    const input = pending.current ?? { requestId: crypto.randomUUID(), expectedAttempt: state?.nextAttempt ?? 1, answer };
    pending.current = input;
    if (storageKey) try { sessionStorage.setItem(storageKey, JSON.stringify(input)); } catch { /* Network retry still works in memory. */ }
    try {
      const response = await runtime.submit(block.id, input.requestId, input.expectedAttempt, input.answer);
      setLocalResult(response); setEditing(false); pending.current = null;
      if (storageKey) try { sessionStorage.removeItem(storageKey); } catch { /* Optional cache. */ }
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500) { pending.current = null; if (storageKey) try { sessionStorage.removeItem(storageKey); } catch { /* Optional cache. */ } }
      setError(exerciseError(cause));
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label={question.title} style={{ border: '1px solid var(--color-border)', padding: 16, borderRadius: 12, marginBlock: 16, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h3>{question.title}</h3>
    <p>{t(config.mode === 'practice' ? 'longreadExercises.practice' : 'longreadExercises.graded')} · {t(config.required ? 'longreadExercises.required' : 'longreadExercises.optional')} · {t('longreadExercises.points', { count: question.points })}</p>
    {question.text && <p style={{ whiteSpace: 'pre-wrap' }}>{question.text}</p>}
    {question.imageUrl && <img src={question.imageUrl} alt={question.title} style={{ maxWidth: '100%', maxHeight: 360 }} />}
    {config.hint && <details><summary style={{ minHeight: 44 }}>{t('longreadExercises.hint')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{config.hint}</p></details>}
    <QuestionResponseFields question={question} answer={answer} onChange={(value) => { if (!pending.current) setAnswer(value); }} disabled={busy || !editing || blocked || !!pending.current} />
    {result && !editing && <div role="status">
      <p>{t(result.isCorrect ? 'longreadExercises.correct' : result.score > 0 ? 'longreadExercises.partial' : 'longreadExercises.incorrect')} · <bdi dir="ltr">{result.score} / {result.maxScore}</bdi></p>
      <p>{t(result.passed ? 'longreadExercises.thresholdPassed' : 'longreadExercises.thresholdFailed')}</p>
      {(result.correctDefinition || result.correctOptionIds?.length) && <p style={{ whiteSpace: 'pre-wrap' }}>{t('longreadExercises.correctAnswer')}: {correctAnswerText(question, result, t)}</p>}
    </div>}
    {!runtime.preview && state && <p>{t('longreadExercises.attempts', { count: state.attemptsUsed, max: config.maxAttempts })}</p>}
    {runtime.preview && <p role="note">{t('longreadExercises.preview')}</p>}
    {blocked && state && <p>{t(state.testExhausted ? 'longreadExercises.testExhausted' : 'longreadExercises.exhausted')}</p>}
    {editing && <button type="button" className="admin-btn admin-btn--primary" style={{ minHeight: 44 }} disabled={busy || blocked || !exerciseAnswerComplete(question, answer)} onClick={() => void submit()}>{t(busy ? 'longreadExercises.sending' : pending.current ? 'longread.retry' : 'longreadExercises.check')}</button>}
    {!editing && !blocked && <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} onClick={() => { setEditing(true); setLocalResult(null); pending.current = null; setError(''); }}>{t('longreadExercises.tryAgain')}</button>}
    {error && <div role="alert"><p>{t(error)}</p><button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} onClick={() => void runtime.reload()}>{t('longreadExercises.refresh')}</button></div>}
  </section>;
}

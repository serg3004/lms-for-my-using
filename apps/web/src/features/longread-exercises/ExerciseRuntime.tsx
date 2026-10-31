import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExerciseStates, ExerciseResult } from '@lms/shared/longread-exercises';
import type { AssessmentAnswer } from '@lms/shared/assessment-question-types';
import { getExerciseStates, finishLongreadTest, submitLongreadExercise, previewLongreadExercise, type LongreadReaderDocument } from '../../shared/api/longreads.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { useOptionalSession } from '../../shared/session.js';

type Runtime = { lessonId: string; version: number | null; preview: boolean; userId: string | null; loading: boolean; state: ExerciseStates | null; error: string;
  reload: () => Promise<void>; submit: (blockId: string, requestId: string, expectedAttempt: number, answer: AssessmentAnswer) => Promise<ExerciseResult | null> };
const Context = createContext<Runtime | null>(null);
export const useExerciseRuntime = () => useContext(Context);
export function exerciseError(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    if (cause.status === 409) return 'longreadExercises.changed';
    if (cause.status === 422) return 'longreadExercises.limitOrRequired';
    if ([401, 403, 404].includes(cause.status)) return 'longreadExercises.unavailable';
    if (cause.status === 400) return 'longreadExercises.invalid';
  }
  return 'longreadExercises.requestFailed';
}
export function ExerciseRuntime({ data, children }: { data: LongreadReaderDocument; children: ReactNode }) {
  const { t } = useTranslation();
  const session = useOptionalSession(), userId = session?.currentUser?.id ?? null;
  const enabled = data.chapters.some((chapter) => chapter.blocks.some((block) => block.type === 'exercise' && !block.hidden));
  const [state, setState] = useState<ExerciseStates | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [finishing, setFinishing] = useState<string | null>(null), [finishError, setFinishError] = useState('');
  const active = useRef(true), finishInFlight = useRef(false), reads = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const reload = useCallback(async () => {
    if (!enabled || data.preview || data.version === null) return;
    const current = ++reads.current;
    setLoading(true); setError('');
    try { const next = await getExerciseStates(data.lessonId, data.version); if (active.current && current === reads.current) setState(next); }
    catch (cause) { if (active.current && current === reads.current) setError(exerciseError(cause)); }
    finally { if (active.current && current === reads.current) setLoading(false); }
  }, [enabled, data.lessonId, data.version, data.preview]);
  useEffect(() => { void reload(); }, [reload, data.navigation.chapter]);
  const value: Runtime = { lessonId: data.lessonId, version: data.version, preview: data.preview, userId, state, loading, error, reload,
    submit: async (blockId, requestId, expectedAttempt, answer) => {
      if (data.preview) return previewLongreadExercise(data.lessonId, blockId, data.draftRevision ?? 0, answer);
      if (data.version === null) throw new Error('No published version');
      const next = await submitLongreadExercise(data.lessonId, blockId, { version: data.version, requestId, expectedAttempt, answer });
      if (active.current) { reads.current++; setLoading(false); setState(next); setError(''); }
      return next.acceptedResult;
    } };
  return <Context.Provider value={value}>
    {enabled && loading && <p role="status">{t('longreadExercises.loading')}</p>}
    {enabled && error && <div role="alert"><p>{t(error)}</p><button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} onClick={() => void reload()}>{t('longread.retry')}</button></div>}
    {children}
    {!data.preview && enabled && state?.tests.map((test) => <section key={test.id} aria-label={test.title} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, marginBlock: 16, minWidth: 0 }}>
      <h3>{t('longreadExercises.finalTest')} · {test.title}</h3>
      <p>{t('longreadExercises.finalHelp')}</p>
      <p>{t('longreadExercises.requiredRemaining', { count: test.requiredRemaining })} · {t('longreadExercises.passingScore', { score: test.passingScore })}</p>
      <p>{t('longreadExercises.testAttempts', { count: test.attemptsUsed })}{test.maxAttempts !== null && ` / ${test.maxAttempts}`}</p>
      {test.latest && <div role="status"><p>{t(test.latest.passed ? 'longreadExercises.testPassed' : 'longreadExercises.testFailed')} · <bdi dir="ltr">{test.latest.score} / {test.latest.maxScore} ({test.latest.percentage}%)</bdi></p>
        <a href={`/learn/attempts/${encodeURIComponent(test.latest.attemptId)}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{t('longreadExercises.openResult')}</a>
      </div>}
      {test.remaining === 0 && <p>{t('longreadExercises.testExhausted')}</p>}
      <button type="button" className="admin-btn admin-btn--primary" style={{ minHeight: 44, maxWidth: '100%', whiteSpace: 'normal' }} disabled={!!finishing || loading || !!test.requiredRemaining} onClick={() => {
        if (finishInFlight.current || data.version === null) return;
        finishInFlight.current = true; setFinishing(test.id); setFinishError('');
        void finishLongreadTest(data.lessonId, data.version, test.id).then((next) => { if (active.current) setState(next.state); }).catch((cause) => { if (active.current) setFinishError(exerciseError(cause)); }).finally(() => { finishInFlight.current = false; if (active.current) setFinishing(null); });
      }}>{t(finishing === test.id ? 'longreadExercises.sending' : 'longreadExercises.finish')}</button>
    </section>)}
    {finishError && <p role="alert">{t(finishError)}</p>}
  </Context.Provider>;
}

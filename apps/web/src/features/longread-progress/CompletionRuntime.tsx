import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompletionReason, LongreadCompletion } from '@lms/shared/longread-progress';
import { completeLongreadChapter, getPublishedLongread, type LongreadReaderDocument } from '../../shared/api/longreads.js';
import { ApiClientError } from '../../shared/apiClient.js';
const errorKey = (cause: unknown) => cause instanceof ApiClientError && cause.status === 409 ? 'longreadProgress.changed' : 'longreadProgress.failed';
type Runtime = { data: LongreadReaderDocument; busy: boolean; action: (blockId?: string) => Promise<void>; refresh: () => Promise<void> };
const Context = createContext<Runtime | null>(null);
export const useCompletion = () => useContext(Context);
export function CompletionReasons({ reasons }: { reasons: CompletionReason[] }) {
  const { t } = useTranslation();
  const unique = [...new Map(reasons.map((r) => [r.code, r])).values()];
  return <ul>{unique.map((reason) => <li key={reason.code}>{t(`longreadProgress.reasons.${reason.code}`, { count: reason.remainingSeconds ?? 0 })}</li>)}</ul>;
}
export function CompletionRuntime({ data, onUpdate, children }: { data: LongreadReaderDocument; onUpdate?: (value: LongreadReaderDocument) => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const inFlight = useRef(false), active = useRef(true), latest = useRef(data), reads = useRef(0); latest.current = data;
  const { t } = useTranslation();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const doc = latest.current;
    if (doc.preview || !doc.completion || !onUpdate || inFlight.current) return;
    const request = ++reads.current;
    try { const next = await getPublishedLongread(doc.lessonId, doc.navigation.chapter); if (active.current && request === reads.current && !inFlight.current && latest.current.navigation.chapter === doc.navigation.chapter && next.version === doc.version) onUpdate(next); }
    catch (cause) { if (active.current) setError(errorKey(cause)); }
  }, [onUpdate]);
  const timed = data.completion?.chapters.find((c) => c.anchor === data.navigation.chapter)?.reasons.some((r) => r.code === 'time');
  useEffect(() => { if (!timed || data.preview) return; const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 3000); return () => clearInterval(timer); }, [timed, data.preview, refresh]);
  const action = async (blockId?: string) => {
    if (inFlight.current || data.preview || data.version === null) return;
    inFlight.current = true; reads.current++; setBusy(true); setError('');
    try { const next = await completeLongreadChapter(data.lessonId, { version: data.version, chapter: data.navigation.chapter, ...(blockId ? { blockId } : {}) }); if (active.current && latest.current.navigation.chapter === data.navigation.chapter) onUpdate?.(next); }
    catch (cause) { if (active.current) { setError(errorKey(cause)); } }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  };
  return <Context.Provider value={{ data, busy, action, refresh }}>{children}{error && <div role="alert"><p>{t(error)}</p><button type="button" className="admin-btn admin-btn--secondary" onClick={() => void refresh()}>{t('longreadProgress.refresh')}</button></div>}</Context.Provider>;
}
export function ContinueBlock({ blockId }: { blockId?: string }) {
  const runtime = useCompletion(), { t } = useTranslation();
  if (!runtime) return null;
  const { data, busy, action } = runtime, gate = data.completion?.chapters.find((c) => c.anchor === data.navigation.chapter)?.gates.find((g) => g.blockId === blockId);
  return <section aria-label={t('longreadProgress.continue')} style={{ marginBlock: 24 }}>
    {!data.preview && gate && <CompletionReasons reasons={gate.reasons} />}
    <button type="button" className="admin-btn admin-btn--primary" style={{ minHeight: 44 }} disabled={busy || !data.preview && (!gate || gate.passed || !!gate.reasons.length)} onClick={() => void action(blockId)}>{t(gate?.passed ? 'longreadProgress.continued' : 'longreadProgress.continue')}</button>
    {data.preview && <p>{t('longreadProgress.preview')}</p>}
  </section>;
}
export function CompletionStatus({ completion, currentAnchor, report = false }: { completion: LongreadCompletion; currentAnchor?: string; report?: boolean }) {
  const { t } = useTranslation(), runtime = useCompletion();
  const current = completion.chapters.find((c) => c.anchor === currentAnchor), reasons = current ? current.reasons : completion.chapters.filter((c) => c.required && !c.completedAt).flatMap((c) => c.reasons);
  return <section aria-label={t('longreadProgress.status')} style={{ marginBlock: 16, overflowWrap: 'anywhere' }}>
    <h3>{t(completion.completed ? 'longreadProgress.done' : 'longreadProgress.incomplete')}</h3>
    <p>{t('longreadProgress.summary', { completed: completion.completedCount, total: completion.requiredCount, percentage: completion.percentage, version: completion.version })}</p>
    {report ? <ul>{completion.chapters.map((chapter) => <li key={chapter.anchor}><strong>{chapter.title ?? chapter.anchor}</strong> · {t(chapter.completedAt ? 'longreadProgress.done' : 'longreadProgress.incomplete')}{chapter.required ? ` · ${t('longreadExercises.required')}` : ''}<CompletionReasons reasons={chapter.reasons} /></li>)}</ul> : <CompletionReasons reasons={reasons} />}
    {!report && runtime && current && <>
      {current.completedAt && <p role="status">{t('longreadProgress.chapterDone')}</p>}
      <button type="button" className="admin-btn admin-btn--primary" style={{ minHeight: 44 }} disabled={runtime.busy || !!current.completedAt || !!reasons.length} onClick={() => void runtime.action()}>{t('longreadProgress.completeChapter')}</button>{' '}
      <button type="button" className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} disabled={runtime.busy} onClick={() => void runtime.refresh()}>{t('longreadProgress.refresh')}</button>
    </>}
  </section>;
}

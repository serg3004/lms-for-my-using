import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../../shared/apiClient.js';
import { getPublishedLongread, saveReadingPosition, type LongreadReaderDocument } from '../../shared/api/longreads.js';
import { PageState } from '../../shared/ui.js';
import { LongreadReader } from './LongreadReader.js';
import { chapterHash, readHash } from './model.js';

export default function LongreadLessonReader({ lessonId, title, courseId, courseTitle }: { lessonId: string; title: string; courseId: string; courseTitle: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<LongreadReaderDocument | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [bookmarkFailed, setBookmarkFailed] = useState(false);
  const isNavigating = useRef(false);
  const current = useRef(data); current.current = data;
  const pending = useRef<AbortController | null>(null), bookmarkRequest = useRef<AbortController | null>(null);
  const retryTarget = useRef<{ chapter: string; index?: number | null } | null>(null);
  const load = useCallback(async (target?: { chapter: string; index?: number | null }) => {
    pending.current?.abort(); bookmarkRequest.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    isNavigating.current = true; setBusy(true); setError(''); retryTarget.current = target ?? null;
    try {
      const hash = readHash(window.location.hash);
      const original = target && current.current ? current.current : await getPublishedLongread(lessonId, hash.chapter, controller.signal);
      if (original.version === null) throw new Error('Invalid published version');
      const saved = await saveReadingPosition(lessonId, { version: original.version, chapter: target?.chapter ?? original.navigation.chapter,
        headingIndex: target ? target.index : hash.headingIndex ?? original.navigation.headingIndex, mode: 'navigate' }, controller.signal);
      if (controller.signal.aborted) return;
      setData(saved); setBookmarkFailed(false);
      const url = chapterHash(saved.navigation.chapter, saved.navigation.headingIndex);
      if (target) window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof ApiClientError && [403, 404].includes(cause.status) ? t('longreadReader.unavailable') : t('longreadReader.loadError'));
    } finally { if (!controller.signal.aborted) { isNavigating.current = false; setBusy(false); } }
  }, [lessonId, t]);
  useEffect(() => {
    void load(); const restore = () => void load();
    window.addEventListener('popstate', restore); window.addEventListener('hashchange', restore);
    return () => { pending.current?.abort(); bookmarkRequest.current?.abort(); window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, [load]);
  const bookmark = useCallback((chapter: string, index: number) => {
    const doc = current.current;
    if (!doc || doc.version === null || isNavigating.current || chapter !== doc.navigation.chapter) return;
    bookmarkRequest.current?.abort(); const controller = new AbortController(); bookmarkRequest.current = controller;
    void saveReadingPosition(lessonId, { version: doc.version, chapter, headingIndex: index, mode: 'bookmark' }, controller.signal).then(() => {
      if (!controller.signal.aborted) { setBookmarkFailed(false); window.history.replaceState(null, '', chapterHash(chapter, index)); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted && !(cause instanceof ApiClientError && cause.status === 409)) setBookmarkFailed(true); });
  }, [lessonId]);
  if (!data) return <PageState variant={error ? 'error' : 'loading'} message={error || t('longreadReader.loading')} action={error && <button type="button" onClick={() => void load()}>{t('longread.retry')}</button>} />;
  return <>
    <a href={`/learn/courses/${encodeURIComponent(courseId)}`}>← {courseTitle}</a>
    <h1>{title}</h1>
    <p>{t('longreadReader.version', { number: data.version })}</p>
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => void load(retryTarget.current ?? undefined)}>{t('longread.retry')}</button></div>}
    {busy && <p role="status">{t('longreadReader.loading')}</p>}
    {bookmarkFailed && <p role="status">{t('longreadReader.bookmarkFailed')}</p>}
    <LongreadReader data={data} busy={busy} onNavigate={(chapter, index) => load({ chapter, index })} onBookmark={bookmark} />
  </>;
}

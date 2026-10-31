import { ExerciseRuntime } from '../longread-exercises/ExerciseRuntime.js';
import { LongreadMediaContext, MediaImage } from '../longread-files/Media.js';
import { MediaPlaybackProvider } from '../longread-media/MediaPlayback.js';
import { safeImage } from './model.js';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { LongreadReaderDocument } from '../../shared/api/longreads.js';
import { chapterContents, chapterHash, headingId, type TocEntry } from './model.js';
import { LongreadContent } from './LongreadContent.js';

const card: CSSProperties = { minWidth: 0, padding: 24, border: '1px solid var(--color-border)', borderRadius: 16, background: 'var(--color-surface)' };
const control: CSSProperties = { minHeight: 44, maxWidth: '100%' };
export function LongreadReader({ data, busy = false, onNavigate, onBookmark }: {
  data: LongreadReaderDocument; busy?: boolean;
  onNavigate: (chapter: string, headingIndex?: number | null) => Promise<void> | void;
  onBookmark?: (chapter: string, index: number) => void;
}) {
  const { t } = useTranslation();
  const [tocOpen, setTocOpen] = useState(data.settings.tableOfContents === 'expanded');
  const tocId = useId();
  const article = useRef<HTMLElement>(null), focusAfterMove = useRef(false);
  const chapter = data.chapters.find((item) => item.anchor === data.navigation.chapter);
  const contents = chapter ? chapterContents(chapter) : [];
  const hasToc = data.settings.tableOfContents !== 'off' && contents.length > 0;
  useEffect(() => {
    if (!chapter) return;
    const index = data.navigation.headingIndex;
    if (index === null && !focusAfterMove.current) return;
    const frame = requestAnimationFrame(() => {
      const target = index !== null ? document.getElementById(headingId(chapter.anchor, index)) : article.current?.querySelector<HTMLElement>('[data-chapter-title]');
      target?.scrollIntoView({ block: 'start' });
      if (focusAfterMove.current) target?.focus({ preventScroll: true });
      focusAfterMove.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter, data.navigation.headingIndex]);
  useEffect(() => {
    if (!chapter || !onBookmark || !article.current || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    const frame = requestAnimationFrame(() => { ready = true; });
    const observer = new IntersectionObserver((entries) => {
      if (!ready) return;
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const index = Number(visible?.target.getAttribute('data-reader-heading'));
      if (!visible || !Number.isInteger(index)) return;
      clearTimeout(timer); timer = setTimeout(() => onBookmark(chapter.anchor, index), 600);
    }, { rootMargin: '-80px 0px -45% 0px' });
    article.current.querySelectorAll('[data-reader-heading]').forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [chapter, data.navigation.headingIndex, onBookmark]);
  if (!chapter) return <p role="alert">{t('longreadReader.unavailable')}</p>;
  const currentIndex = data.chapters.indexOf(chapter);
  async function navigate(anchor: string, index?: number | null) {
    if (busy) return;
    focusAfterMove.current = true; await onNavigate(anchor, index);
  }
  function toc(entries: TocEntry[]) {
    return <ul style={{ paddingInlineStart: 20 }}>{entries.map((entry) => <li key={entry.index}>
      <a href={chapterHash(chapter!.anchor, entry.index)} aria-disabled={busy || undefined} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, overflowWrap: 'anywhere' }} onClick={(event) => { event.preventDefault(); void navigate(chapter!.anchor, entry.index); }}>{entry.label || t('longreadReader.untitledHeading')}</a>
      {entry.children.length > 0 && toc(entry.children)}
    </li>)}</ul>;
  }
  return <MediaPlaybackProvider key={data.lessonId}><LongreadMediaContext.Provider value={{ lessonId: data.lessonId, version: data.version }}><section className="longread-reader" dir={data.settings.direction} style={{ minWidth: 0, width: '100%' }} aria-label={t('longreadReader.reader')}>
    {safeImage(data.settings.cover) && <MediaImage image={data.settings.cover} />}
    {data.preview && <p role="note">{t('longreadReader.previewNotice')}</p>}
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBlock: 16 }}>
      <label htmlFor={`${tocId}-chapters`}>{t('longread.chapters')}</label>
      <select id={`${tocId}-chapters`} style={control} value={chapter.anchor} disabled={busy} onChange={(event) => void navigate(event.target.value)}>
        {data.chapters.map((item, index) => <option key={item.anchor} value={item.anchor} disabled={!data.navigation.allowedAnchors.includes(item.anchor)}>{index + 1}. {item.title}</option>)}
      </select>
      <span>{t('longreadReader.chapter')} <bdi dir="ltr">{currentIndex + 1} / {data.chapters.length}</bdi></span>
      {hasToc && <button className="admin-btn admin-btn--secondary" style={control} type="button" aria-controls={tocId} aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>{t(tocOpen ? 'longreadReader.hideContents' : 'longreadReader.showContents')}</button>}
    </div>
    <p>{t(data.settings.readingOrder === 'sequential' ? 'longreadReader.sequential' : 'longreadReader.free')} · {t('longreadReader.required', { count: data.settings.requiredChapters })}</p>
    {!data.settings.allowCopy && <p>{t('longreadReader.copyNotice')}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20, minWidth: 0 }}>
      {hasToc && <aside id={tocId} hidden={!tocOpen} style={{ ...card, flex: '1 1 200px' }}>
        <h2 style={{ marginTop: 0 }}>{t('longreadReader.contents')}</h2>
        <nav style={{ display: 'block' }} aria-label={t('longreadReader.contents')}>{toc(contents)}</nav>
      </aside>}
      <article ref={article} style={{ ...card, flex: '4 1 480px', overflowWrap: 'anywhere' }}>
        <h2 data-chapter-title tabIndex={-1} style={{ marginTop: 0, scrollMarginTop: 100 }}>{chapter.title}</h2>
        {safeImage(chapter.cover) && <MediaImage image={chapter.cover} />}
        <ExerciseRuntime key={`${data.lessonId}:${data.version}:${data.preview}`} data={data}><LongreadContent blocks={chapter.blocks} chapter={chapter.anchor} allowCopy={data.settings.allowCopy} navigate={(anchor) => void navigate(anchor)} t={t} /></ExerciseRuntime>
        {!chapter.blocks.length && <p>{t('longreadReader.emptyChapter')}</p>}
        <nav aria-label={t('longreadReader.navigation')} style={{ marginTop: 24, justifyContent: 'space-between' }}>
          <button className="admin-btn admin-btn--secondary" style={control} type="button" disabled={busy || !data.navigation.previousAnchor} onClick={() => data.navigation.previousAnchor && void navigate(data.navigation.previousAnchor)}>{t('longreadReader.previous')}</button>
          <button className="admin-btn admin-btn--primary" style={control} type="button" disabled={busy || !data.navigation.nextAnchor} onClick={() => data.navigation.nextAnchor && void navigate(data.navigation.nextAnchor)}>{t('longreadReader.next')}</button>
        </nav>
      </article>
    </div>
  </section></LongreadMediaContext.Provider></MediaPlaybackProvider>;
}

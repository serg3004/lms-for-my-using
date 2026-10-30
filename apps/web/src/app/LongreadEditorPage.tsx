import { ReaderSettings } from '../features/longread-reader/ReaderSettings.js';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminPageLayout, AdminPageHeader } from '../shared/adminPage.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { ConfirmDialog, Dialog, PageState } from '../shared/ui.js';
import { getLesson } from '../shared/api/lessons.js';
import { getLongreadDraft, type LongreadDraft } from '../shared/api/longreads.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { useLongreadEditor } from '../features/longread-editor/useLongreadEditor.js';
import { blockTypes, compositeTypes, copyBlock, editableBlock, moveItem, newBlock, type AddableBlockType, type EditorBlock, type EditorChapter } from '../features/longread-editor/model.js';
import { RichTextEditor } from '../features/longread-editor/RichTextEditor.js';
import { ListPreview, TextPreview } from '../features/longread-editor/BlockPreview.js';
import { CompositeBlockEditor } from '../features/longread-editor/CompositeBlocks.js';
import '../features/longread-editor/editor.css';

const LongreadPreview = lazy(() => import('../features/longread-reader/LongreadPreview.js'));

export function LongreadEditorPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { state, reload } = useAsyncData(async () => {
    const [lesson, draft] = await Promise.all([getLesson(id), getLongreadDraft(id)]);
    return { lesson, draft };
  }, [id], { error: t('longread.loadError'), notFound: t('longread.notFound'), unauthenticated: t('longread.forbidden') });
  const instructor = useLocation().pathname.startsWith('/instructor/');
  const body = state.status === 'loaded'
    ? <Editor key={`${id}-${state.data.draft.revision}`} initial={state.data.draft} title={state.data.lesson.title} back={instructor ? `/instructor/courses/${state.data.lesson.courseId}/edit` : `/admin/courses/${state.data.lesson.courseId}`} reload={() => void reload()} />
    : <PageState variant={state.status === 'loading' ? 'loading' : 'error'} message={state.status === 'loading' ? t('longread.loading') : state.message} action={state.status !== 'loading' && <button type="button" onClick={() => void reload()}>{t('longread.retry')}</button>} />;
  return instructor ? <InstructorPageLayout>{body}</InstructorPageLayout> : <AdminPageLayout brandLabel={t('admin.navLink')} sidebarLabel={t('admin.sidebarLabel')} navItems={[{ label: t('admin.lessons.title'), href: '/admin/lessons', isCurrent: true }]}>{body}</AdminPageLayout>;
}

function Editor({ initial, title, back, reload }: { initial: LongreadDraft; title: string; back: string; reload: () => void }) {
  const { t } = useTranslation();
  const editor = useLongreadEditor(initial);
  const { chapters } = editor.document;
  const [chapterKey, setChapterKey] = useState(chapters[0]!.key);
  const chapter = chapters.find((item) => item.key === chapterKey) ?? chapters[0]!;
  const [blockKey, setBlockKey] = useState<string | null>(chapter.blocks[0]?.key ?? null);
  const selected = chapter.blocks.find((block) => block.key === blockKey);
  const [blockType, setBlockType] = useState<AddableBlockType>('paragraph');
  const [remove, setRemove] = useState<{ chapter: string; block?: string } | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const previewClose = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const chapterInput = useRef<HTMLInputElement>(null), recoveryInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editor.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link && !link.getAttribute('href')?.startsWith('#') && !window.confirm(t('longread.unsavedLeave'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
  }, [editor.dirty, t]);
  function updateChapter(update: (value: EditorChapter) => EditorChapter) {
    editor.change((doc) => ({ chapters: doc.chapters.map((item) => item.key === chapter.key ? update(item) : item) }));
  }
  function updateBlock(key: string, update: (value: EditorBlock) => EditorBlock) {
    updateChapter((item) => ({ ...item, blocks: item.blocks.map((block) => block.key === key ? update(block) : block) }));
  }
  function moveChapter(delta: number) { editor.change((doc) => ({ chapters: moveItem(doc.chapters, doc.chapters.findIndex((item) => item.key === chapter.key), delta) })); }
  function moveBlock(key: string, delta: number) { updateChapter((item) => ({ ...item, blocks: moveItem(item.blocks, item.blocks.findIndex((block) => block.key === key), delta) })); }
  const action = (label: string, click: () => void, disabled = false) => <button className="admin-btn admin-btn--secondary" type="button" disabled={disabled} onClick={click}>{label}</button>;
  const label = (block: EditorBlock) => block.title || (editableBlock(block) ? t(`longread.types.${block.type}`) : t('longread.unknown'));
  const chapterIndex = chapters.findIndex((item) => item.key === chapter.key);
  return <div className="lr-editor" onKeyDownCapture={(event) => {
    if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault(); if (event.shiftKey || event.key.toLowerCase() === 'y') editor.redo(); else editor.undo();
    }
  }}>
    <Link to={back}>← {t('longread.back')}</Link>
    <AdminPageHeader eyebrow={t('longread.editor')} title={title} action={<div className="admin-table-actions lr-toolbar">
      {action(t('longreadReader.preview'), () => setPreview(true), editor.dirty || editor.status !== 'saved' || chapter.hidden)}
      {action(t('longread.undo'), editor.undo, !editor.canUndo)}{action(t('longread.redo'), editor.redo, !editor.canRedo)}
      <span role="status" aria-live="polite">{t(`longread.states.${editor.status}`)}</span>
      {editor.status === 'error' && action(t('longread.retry'), editor.retry)}
    </div>} />
    {(editor.status === 'error' || editor.status === 'conflict' || editor.status === 'invalid') && <section className="lr-warning" role="alert">
      <p>{t(`longread.messages.${editor.status}`)}</p>
      {editor.status === 'conflict' && action(t('longread.reload'), () => { if (window.confirm(t('longread.discard'))) reload(); })}
      {action(t('longread.copyEdits'), () => { setRecovery(editor.recovery()); setCopied(false); })}
    </section>}
    <ReaderSettings settings={editor.document.settings ?? initial.settings} onChange={(patch) => editor.change((doc) => ({ ...doc, settings: { ...(doc.settings ?? initial.settings), ...patch } }))} />
    <Dialog open={preview} onClose={() => setPreview(false)} labelledBy="longread-preview-title" className="admin-preview-overlay" initialFocusRef={previewClose}>
      {preview && <div style={{ maxWidth: 1400, marginInline: 'auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-surface)', padding: 8 }}>
          <h2 id="longread-preview-title" style={{ fontSize: 20, minWidth: 0, marginBlock: 8 }}>{t('longreadReader.preview')} · {title}</h2>
          <button className="admin-btn admin-btn--secondary" type="button" ref={previewClose} onClick={() => setPreview(false)}>{t('longread.close')}</button>
        </header>
        <Suspense fallback={<PageState variant="loading" message={t('longreadReader.loading')} />}>
          <LongreadPreview lessonId={initial.lessonId} chapterId={editor.serverId(chapter.key)} />
        </Suspense>
      </div>}
    </Dialog>
    <div className="lr-layout" style={{ alignItems: 'start' }}>
      <nav className="admin-card lr-panel" style={{ display: 'block' }} aria-label={t('longread.chapters')}>
        <h2>{t('longread.chapters')}</h2>
        <ol className="lr-chapters" style={{ listStyle: 'none', padding: 0 }}>{chapters.map((item, index) => <li key={item.key}>
          <button className="admin-btn admin-btn--secondary" style={{ width: '100%', textAlign: 'start', marginBlock: 4, borderColor: item.key === chapter.key ? 'var(--color-primary)' : undefined }} type="button" aria-current={item.key === chapter.key ? 'true' : undefined} onClick={() => { setChapterKey(item.key); setBlockKey(item.blocks[0]?.key ?? null); }} onKeyDown={(event) => {
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); editor.change((doc) => ({ chapters: moveItem(doc.chapters, index, event.key === 'ArrowUp' ? -1 : 1) })); }
          }}>{index + 1}. {item.title || t('longread.untitled')}{item.hidden ? ` · ${t('longread.hidden')}` : ''}</button>
        </li>)}</ol>
        {action(t('longread.addChapter'), () => {
          const next: EditorChapter = { key: crypto.randomUUID(), title: t('longread.newChapter', { number: chapters.length + 1 }), hidden: false, blocks: [] };
          editor.change((doc) => ({ chapters: [...doc.chapters, next] })); setChapterKey(next.key); setBlockKey(null);
        }, chapters.length >= 200)}
        <p>{t('longread.moveHint')}</p>
      </nav>
      <section className="lr-canvas" aria-label={t('longread.workspace')}>
        <div className="admin-card lr-panel">
          <h2>{chapter.title || t('longread.untitled')}</h2>
          <label htmlFor="lr-chapter-title">{t('longread.chapterTitle')}</label>
          <input id="lr-chapter-title" ref={chapterInput} value={chapter.title} maxLength={200} aria-invalid={!chapter.title.trim()} onChange={(event) => updateChapter((item) => ({ ...item, title: event.target.value }))} />
          <div className="admin-table-actions lr-toolbar" role="group" aria-label={t('longread.chapterActions')}>
            {action(t('longread.rename'), () => chapterInput.current?.focus())}
            {action(t('longread.up'), () => moveChapter(-1), chapterIndex === 0)}
            {action(t('longread.down'), () => moveChapter(1), chapterIndex === chapters.length - 1)}
            {action(t(chapter.hidden ? 'longread.show' : 'longread.hide'), () => updateChapter((item) => ({ ...item, hidden: !item.hidden })))}
            {action(t('longread.duplicate'), () => {
              const next = { ...chapter, key: crypto.randomUUID(), title: t('longread.copyName', { name: chapter.title }).slice(0, 200), blocks: chapter.blocks.map(copyBlock) };
              editor.change((doc) => ({ chapters: [...doc.chapters.slice(0, chapterIndex + 1), next, ...doc.chapters.slice(chapterIndex + 1)] })); setChapterKey(next.key); setBlockKey(next.blocks[0]?.key ?? null);
            }, chapters.length >= 200)}
            {action(t('longread.delete'), () => setRemove({ chapter: chapter.key }), chapters.length === 1)}
          </div>
        </div>
        {!chapter.blocks.length && <p>{t('longread.empty')}</p>}
        {chapter.blocks.map((block, index) => <article key={block.key} className={`admin-card lr-panel lr-block${block.key === blockKey ? ' lr-selected' : ''}`} aria-label={`${index + 1}. ${label(block)}`} onKeyDown={(event) => {
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); moveBlock(block.key, event.key === 'ArrowUp' ? -1 : 1); }
        }}>
          <div className="admin-table-actions lr-toolbar">
            <button className="admin-btn admin-btn--secondary" type="button" aria-pressed={block.key === blockKey} onClick={() => setBlockKey(block.key)}>{index + 1}. {label(block)}</button>
            {block.hidden && <span>{t('longread.hidden')}</span>}
            {action(t('longread.up'), () => moveBlock(block.key, -1), index === 0)}{action(t('longread.down'), () => moveBlock(block.key, 1), index === chapter.blocks.length - 1)}
          </div>
          {!editableBlock(block) ? <p>{t('longread.unknownMessage')}</p>
            : block.type === 'divider' ? <hr />
            : block.type === 'code' ? <>
              <label htmlFor={`code-${block.key}`}>{t('longread.codeText')}</label>
              <textarea id={`code-${block.key}`} className="lr-code" value={String(block.content.code ?? '')} maxLength={50_000} spellCheck={false} onFocus={() => setBlockKey(block.key)} onChange={(event) => updateBlock(block.key, (item) => ({ ...item, content: { ...item.content, code: event.target.value } }))} />
              {action(t('longread.copyCode'), () => { (document.getElementById(`code-${block.key}`) as HTMLTextAreaElement | null)?.select(); void navigator.clipboard?.writeText(String(block.content.code ?? '')).catch(() => {}); })}
            </>
            : compositeTypes.includes(block.type) ? <CompositeBlockEditor block={block} t={t} onChange={(content) => updateBlock(block.key, (item) => ({ ...item, content }))}
              onConvert={(type, content) => updateBlock(block.key, (item) => ({ ...item, type, content }))} />
            : block.key === blockKey ? <RichTextEditor key={`${block.key}-${Boolean(block.content.ordered)}`} block={block} t={t} onChange={(content) => updateBlock(block.key, (item) => ({ ...item, content }))} />
            : block.type === 'list' ? <ListPreview block={block} />
            : <TextPreview block={block} />}
        </article>)}
        <div className="admin-card lr-panel">
          <label htmlFor="lr-block-type">{t('longread.blockType')}</label>
          <select id="lr-block-type" value={blockType} onChange={(event) => setBlockType(event.target.value as AddableBlockType)}>{blockTypes.map((type) => <option value={type} key={type}>{t(`longread.types.${type}`)}</option>)}</select>
          {action(t('longread.addBlock'), () => { const block = newBlock(blockType, (n) => t('longread.composite.newItem', { number: n })); updateChapter((item) => ({ ...item, blocks: [...item.blocks, block] })); setBlockKey(block.key); }, chapter.blocks.length >= 1000)}
        </div>
      </section>
      <aside className="admin-card lr-panel" aria-label={t('longread.properties')}>
        <h2>{t('longread.properties')}</h2>
        {!selected ? <p>{t('longread.selectBlock')}</p> : <>
          <label htmlFor="lr-block-name">{t('longread.blockName')}</label>
          <input id="lr-block-name" maxLength={200} value={selected.title ?? ''} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, title: event.target.value || null }))} />
          <div className="admin-table-actions lr-toolbar">
            {action(t(selected.hidden ? 'longread.show' : 'longread.hide'), () => updateBlock(selected.key, (item) => ({ ...item, hidden: !item.hidden })))}
            {action(t('longread.duplicate'), () => { const block = copyBlock(selected); updateChapter((item) => { const i = item.blocks.findIndex((b) => b.key === selected.key); return { ...item, blocks: [...item.blocks.slice(0, i + 1), block, ...item.blocks.slice(i + 1)] }; }); setBlockKey(block.key); }, chapter.blocks.length >= 1000)}
            {action(t('longread.delete'), () => setRemove({ chapter: chapter.key, block: selected.key }))}
          </div>
          <label htmlFor="lr-move-chapter">{t('longread.moveToChapter')}</label>
          <select id="lr-move-chapter" value={chapter.key} onChange={(event) => {
            const destination = event.target.value;
            editor.change((doc) => ({ chapters: doc.chapters.map((item) => item.key === destination ? { ...item, blocks: [...item.blocks, selected] } : item.key === chapter.key ? { ...item, blocks: item.blocks.filter((b) => b.key !== selected.key) } : item) })); setChapterKey(destination);
          }}>{chapters.map((item) => <option key={item.key} value={item.key} disabled={item.key !== chapter.key && item.blocks.length >= 1000}>{item.title || t('longread.untitled')}</option>)}</select>
          {editableBlock(selected) && <>
            {selected.type === 'heading' && <><label style={{ display: 'block', marginBlock: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={Boolean(selected.content.excludeFromToc)} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, excludeFromToc: event.target.checked } }))} /> {t('longreadReader.excludeFromToc')}</label><label htmlFor="lr-level">{t('longread.headingLevel')}</label><select id="lr-level" value={Number(selected.content.level)} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, level: Number(event.target.value) } }))}>{[1, 2, 3].map((n) => <option key={n} value={n}>H{n}</option>)}</select></>}
            {selected.type === 'list' && <label><input type="checkbox" checked={Boolean(selected.content.ordered)} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, ordered: event.target.checked } }))} /> {t('longread.ordered')}</label>}
            {selected.type === 'note' && <><label htmlFor="lr-tone">{t('longread.noteTone')}</label><select id="lr-tone" value={String(selected.content.tone)} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, tone: event.target.value } }))}>{['info', 'success', 'warning', 'danger'].map((tone) => <option key={tone} value={tone}>{t(`longread.tones.${tone}`)}</option>)}</select></>}
            {selected.type === 'quote' && <><label htmlFor="lr-caption">{t('longread.caption')}</label><input id="lr-caption" maxLength={500} value={String(selected.content.caption ?? '')} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, caption: event.target.value } }))} /></>}
            {selected.type === 'code' && <><label htmlFor="lr-language">{t('longread.language')}</label><input id="lr-language" maxLength={40} value={String(selected.content.language ?? '')} onChange={(event) => updateBlock(selected.key, (item) => ({ ...item, content: { ...item.content, language: event.target.value } }))} /></>}
          </>}
        </>}
      </aside>
    </div>
    <ConfirmDialog open={!!remove} title={t('longread.deleteTitle')} message={t('longread.deleteMessage')} confirmLabel={t('longread.delete')} cancelLabel={t('longread.cancel')} danger onCancel={() => setRemove(null)} onConfirm={() => {
      if (!remove) return;
      editor.change((doc) => ({ chapters: remove.block ? doc.chapters.map((item) => item.key === remove.chapter ? { ...item, blocks: item.blocks.filter((b) => b.key !== remove.block) } : item) : doc.chapters.length > 1 ? doc.chapters.filter((item) => item.key !== remove.chapter) : doc.chapters })); setRemove(null);
    }} />
    <Dialog open={recovery !== null} onClose={() => setRecovery(null)} labelledBy="lr-recovery-title" className="admin-dialog" initialFocusRef={recoveryInput}>
      <h2 id="lr-recovery-title">{t('longread.copyEdits')}</h2>
      <label htmlFor="lr-recovery">{t('longread.recoveryHelp')}</label>
      <textarea style={{ width: '100%' }} id="lr-recovery" ref={recoveryInput} readOnly value={recovery ?? ''} rows={12} />
      {action(t('longread.copy'), () => { recoveryInput.current?.select(); void navigator.clipboard?.writeText(recovery ?? '').then(() => setCopied(true)).catch(() => setCopied(false)); })}
      {copied && <p role="status">{t('longread.copied')}</p>}
      {action(t('longread.close'), () => setRecovery(null))}
    </Dialog>
  </div>;
}

import { ExerciseBlock } from '../longread-exercises/ExerciseBlock.js';
import { MediaImage, MediaAttachment } from '../longread-files/Media.js';
import { MediaPlayer, EmbeddedVideo } from '../longread-media/MediaPlayback.js';
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { ReaderBlock } from '../../shared/api/longreads.js';
import type { Run } from '../longread-editor/model.js';
import { headingId, safeBlock, type ListContent } from './model.js';

const textStyle: CSSProperties = { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', lineHeight: 1.8 };
function Runs({ runs, navigate }: { runs: Run[]; navigate: (chapter: string) => void }) {
  return <>{runs.map((run, index) => {
    let node: ReactNode = run.text;
    if (run.bold) node = <strong>{node}</strong>;
    if (run.italic) node = <em>{node}</em>;
    if (run.underline) node = <u>{node}</u>;
    if (run.code) node = <code dir="ltr">{node}</code>;
    if (run.href) {
      const href = run.href;
      node = <a href={href} rel="noopener noreferrer" onClick={href.startsWith('#') ? (event) => { event.preventDefault(); navigate(href.slice(1)); } : undefined}><bdi>{node}</bdi></a>;
    }
    return <span key={index}>{node}</span>;
  })}</>;
}
function List({ content, navigate }: { content: ListContent; navigate: (chapter: string) => void }) {
  let position = 0;
  function render(level: number): ReactNode {
    const children: ReactNode[] = [];
    while (position < content.items.length && content.items[position]!.level === level) {
      const index = position++, item = content.items[index]!;
      const nested = (content.items[position]?.level ?? 0) > level ? render(level + 1) : null;
      children.push(<li key={index}><Runs runs={item.runs} navigate={navigate} />{nested}</li>);
    }
    return content.ordered ? <ol style={{ paddingInlineStart: 24 }}>{children}</ol> : <ul style={{ paddingInlineStart: 24 }}>{children}</ul>;
  }
  return render(1);
}
function Code({ code, language, allowCopy, t }: { code: string; language: string; allowCopy: boolean; t: TFunction }) {
  const ref = useRef<HTMLElement>(null); const [copied, setCopied] = useState(false); const id = useId();
  return <section aria-labelledby={id}>
    <div id={id}>{t('longreadReader.code')} · <bdi dir="ltr">{language}</bdi></div>
    <pre dir="ltr" tabIndex={0} style={{ maxWidth: '100%', overflowX: 'auto', padding: 16, background: 'var(--color-background)', borderRadius: 8 }}><code ref={ref}>{code}</code></pre>
    {allowCopy && <button className="admin-btn admin-btn--secondary" style={{ minHeight: 44 }} type="button" onClick={() => {
      if (ref.current) { const range = document.createRange(); range.selectNodeContents(ref.current); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
      void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => setCopied(false));
    }}>{t('longread.copyCode')}</button>}
    {copied && <p role="status">{t('longread.copied')}</p>}
  </section>;
}
export function LongreadContent({ blocks, chapter, allowCopy, navigate, t }: { blocks: ReaderBlock[]; chapter: string; allowCopy: boolean; navigate: (chapter: string) => void; t: TFunction }) {
  return <>{blocks.map((block, index) => {
    if (block.hidden) return null;
    if (block.type === 'exercise' && block.schemaVersion === 1) return <ExerciseBlock key={block.id ?? index} block={block} />;
    const value = safeBlock(block);
    if (!value) return <p key={index} role="note">{t('longreadReader.unsupported')}</p>;
    if (value.type === 'audio' || value.type === 'video') return <MediaPlayer key={index} type={value.type} content={value.content} />;
    if (value.type === 'embed') return <EmbeddedVideo key={index} content={value.content} />;
    if (value.type === 'image') return <MediaImage key={index} image={value.content} />;
    if (value.type === 'attachments') return <div key={index}>{value.content.files.map((file) => <MediaAttachment key={file.fileId} {...file} />)}</div>;
    if (value.type === 'divider') return <hr key={index} />;
    if (value.type === 'code') return <Code key={index} {...value.content} allowCopy={allowCopy} t={t} />;
    if (value.type === 'list') return <div key={index} style={textStyle}><List content={value.content} navigate={navigate} /></div>;
    const body = <Runs runs={value.content.runs} navigate={navigate} />;
    if (value.type === 'heading') {
      const Heading = `h${value.content.level}` as 'h1' | 'h2' | 'h3';
      return <Heading key={index} id={headingId(chapter, index)} data-reader-heading={index} tabIndex={-1} style={{ overflowWrap: 'anywhere', scrollMarginTop: 100 }}>{body}</Heading>;
    }
    if (value.type === 'quote') return <blockquote key={index} style={{ ...textStyle, marginInline: 0, paddingInlineStart: 20, borderInlineStart: '3px solid var(--color-primary)' }}>{body}{value.content.caption && <footer>{value.content.caption}</footer>}</blockquote>;
    if (value.type === 'note') return <aside key={index} role="note" style={{ ...textStyle, padding: 16, border: '1px solid var(--color-border)', borderRadius: 12 }}>{body}</aside>;
    return <p key={index} style={textStyle}>{body}</p>;
  })}</>;
}

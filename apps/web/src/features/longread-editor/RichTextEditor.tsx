import { useEffect, useId, useState } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plugin } from '@tiptap/pm/state';
import type { TFunction } from 'i18next';
import { clipboardText, fromRichDocument, inlineNodes, listDepth, toRichDocument } from './richText.js';
import { safeHref, type EditorBlock } from './model.js';

const DepthLimit = Extension.create({
  name: 'longreadDepthLimit',
  addProseMirrorPlugins() { return [new Plugin({ filterTransaction: (transaction) => !transaction.docChanged || listDepth(transaction.doc.toJSON()) <= 3 })]; },
});

export function RichTextEditor({ block, onChange, t }: { block: EditorBlock; onChange: (content: Record<string, unknown>) => void; t: TFunction }) {
  const [linkOpen, setLinkOpen] = useState(false), [href, setHref] = useState(''), [linkError, setLinkError] = useState(false);
  const linkId = useId();
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false, strike: false, undoRedo: false,
      bulletList: block.type === 'list' && !block.content.ordered ? {} : false, orderedList: block.type === 'list' && block.content.ordered ? {} : false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: (url) => safeHref(url) }, trailingNode: false }), DepthLimit],
    content: toRichDocument(block),
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': t('longread.types.paragraph'), 'aria-multiline': 'true', spellcheck: 'true' },
      handlePaste: (_view, event) => {
        event.preventDefault();
        const text = clipboardText(event.clipboardData?.getData('text/plain') ?? '', event.clipboardData?.getData('text/html') ?? '');
        if (text) editor?.commands.insertContent(inlineNodes([{ text }]));
        return true;
      },
      handleDrop: () => true,
    },
    onUpdate: ({ editor: current }) => onChange(fromRichDocument(current.getJSON(), block)),
  });
  useEffect(() => {
    if (editor && JSON.stringify(fromRichDocument(editor.getJSON(), block)) !== JSON.stringify(block.content)) editor.commands.setContent(toRichDocument(block), { emitUpdate: false });
  }, [editor, block]);
  if (!editor) return null;
  let selectedDepth = 0;
  for (let depth = 0; depth <= editor.state.selection.$from.depth; depth++) {
    const name = editor.state.selection.$from.node(depth).type.name;
    if (name === 'bulletList' || name === 'orderedList') selectedDepth++;
  }
  const format = (kind: 'bold' | 'italic' | 'underline') => {
    const chain = editor.chain().focus();
    if (kind === 'bold') chain.toggleBold().run(); else if (kind === 'italic') chain.toggleItalic().run(); else chain.toggleUnderline().run();
  };
  return <>
    <div className="admin-table-actions lr-toolbar" role="group" aria-label={t('longread.formatting')}>
      {(['bold', 'italic', 'underline'] as const).map((kind) => <button className="admin-btn admin-btn--secondary" type="button" key={kind} aria-pressed={editor.isActive(kind)} onClick={() => format(kind)}>{t(`longread.${kind}`)}</button>)}
      <button className="admin-btn admin-btn--secondary" type="button" aria-pressed={editor.isActive('link')} onClick={() => { setHref(String(editor.getAttributes('link').href ?? '')); setLinkError(false); setLinkOpen(!linkOpen); }}>{t('longread.link')}</button>
      {block.type === 'list' && <>
        <button className="admin-btn admin-btn--secondary" type="button" disabled={!editor.can().sinkListItem('listItem') || selectedDepth >= 3} onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>{t('longread.indent')}</button>
        <button className="admin-btn admin-btn--secondary" type="button" disabled={!editor.can().liftListItem('listItem')} onClick={() => editor.chain().focus().liftListItem('listItem').run()}>{t('longread.outdent')}</button>
      </>}
    </div>
    {linkOpen && <div className="lr-link">
      <label htmlFor={linkId}>{t('longread.linkAddress')}</label>
      <input id={linkId} value={href} maxLength={2048} aria-invalid={linkError} aria-describedby={linkError ? `${linkId}-error` : undefined} onChange={(event) => setHref(event.target.value)} />
      <button className="admin-btn admin-btn--secondary" type="button" onClick={() => {
        if (href && !safeHref(href)) { setLinkError(true); return; }
        const chain = editor.chain().focus().extendMarkRange('link');
        if (href) chain.setLink({ href }).run(); else chain.unsetLink().run();
        setLinkOpen(false);
      }}>{t('longread.apply')}</button>
      <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setLinkOpen(false)}>{t('longread.cancel')}</button>
      {linkError && <p id={`${linkId}-error`} role="alert">{t('longread.unsafeLink')}</p>}
    </div>}
    <EditorContent className="lr-rich" style={{ fontSize: block.type === 'heading' ? `${1.75 - Number(block.content.level) * 0.2}rem` : undefined, fontWeight: block.type === 'heading' ? 700 : undefined, borderInlineStart: block.type === 'quote' ? '3px solid var(--color-primary)' : undefined, background: block.type === 'note' ? 'var(--color-accent-muted)' : undefined }} editor={editor} />
  </>;
}

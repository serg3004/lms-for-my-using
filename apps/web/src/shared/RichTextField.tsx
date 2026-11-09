import { memo, useCallback, useEffect, useId, useMemo, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEventHandler, KeyboardEventHandler } from 'react';
import { type Editor, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useTranslation } from 'react-i18next';
import { DESCRIPTION_MARKUP_LIMIT, descriptionHtml, descriptionText, sanitizeDescription } from '@lms/shared/checklist-description';
import { AlignExtension, StyleMark, useFormattingWindow } from './FormattingWindow.js';

// Serialize the document model: DOM CSS serialization changes hex colours to rgb(), which the API intentionally rejects.
function editorValue(editor: Editor, centerDefault = false) {
  function serialize(node: JSONContent): string {
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'text') {
      let text = (node.text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') text = `<strong>${text}</strong>`;
        if (mark.type === 'italic') text = `<em>${text}</em>`;
        if (mark.type === 'underline') text = `<u>${text}</u>`;
        if (mark.type === 'descriptionStyle') {
          const attrs = mark.attrs ?? {};
          const style = [attrs.size ? `font-size:${attrs.size}px` : '', attrs.color ? `color:${attrs.color}` : '', attrs.uppercase ? 'text-transform:uppercase' : ''].filter(Boolean).join(';');
          text = `<span style="${style}">${text}</span>`;
        }
      }
      return text;
    }
    const children = (node.content ?? []).map(serialize).join('');
    const align = String(node.attrs?.textAlign ?? (centerDefault ? 'center' : 'left'));
    // PR 455: with a centered default (image captions) the unwritten alignment is "center" and an explicit "left" is written.
    return node.type === 'paragraph' ? `<p${align === (centerDefault ? 'center' : 'left') ? '' : ` style="text-align:${align}"`}>${children}</p>` : children;
  }
  return sanitizeDescription(serialize(editor.getJSON()), { keepLeft: centerDefault });
}

type RichTextFieldProps = {
  value: string; onChange: (value: string) => void; label: string; id?: string; maxLength?: number; disabled?: boolean; compact?: boolean; hideHint?: boolean; singleLine?: boolean; hideLabel?: boolean; /** PR 455: image captions are centered unless the author chose another alignment. */ defaultAlign?: 'left' | 'center'; onBlur?: FocusEventHandler<HTMLDivElement>; onFocus?: FocusEventHandler<HTMLDivElement>; onKeyDown?: KeyboardEventHandler<HTMLDivElement>; invalid?: boolean; describedBy?: string; className?: string;
};

const RichTextFieldInner = memo(function RichTextFieldInner({ value, onChange, label, id, maxLength = 2000, disabled = false, compact = false, hideHint = false, singleLine = false, hideLabel = false, defaultAlign = 'left', onBlur, onFocus, onKeyDown, invalid, describedBy, className }: RichTextFieldProps) {
  const { t } = useTranslation(), uid = useId(), labelId = `${uid}-label`, hintId = `${uid}-hint`;
  const [lengthError, setLengthError] = useState(false), [focused, setFocused] = useState(false);
  const formatting = useFormattingWindow(disabled);
  const centerDefault = defaultAlign === 'center';
  const toHtml = useCallback((text: string) => descriptionHtml(text, { keepLeft: centerDefault }), [centerDefault]);
  const toClean = useCallback((text: string) => sanitizeDescription(text, { keepLeft: centerDefault }), [centerDefault]);
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: true, editable: !disabled,
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, bulletList: false, orderedList: false, listItem: false, link: false, trailingNode: false, paragraph: { HTMLAttributes: { style: 'margin:0' } } }), StyleMark, AlignExtension.configure({ defaultAlign })],
    content: toHtml(value),
    editorProps: {
      attributes: { id: id ?? uid, role: 'textbox', 'aria-labelledby': labelId, 'aria-describedby': [hintId, describedBy].filter(Boolean).join(' '), 'aria-invalid': invalid ? 'true' : 'false', 'aria-multiline': singleLine ? 'false' : 'true', class: ['admin-textarea', className].filter(Boolean).join(' '), style: `min-height:${singleLine || compact ? 44 : 88}px;width:100%;box-sizing:border-box;font-size:16px;white-space:${singleLine ? 'nowrap' : 'pre-wrap'};overflow-x:auto;overflow-wrap:anywhere;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px 12px;background:var(--color-surface)` },
      handleDOMEvents: {
        contextmenu: (_view, event) => formatting.handleContextMenu(event),
        keydown: (_view, event) => {
          if (singleLine && event.key === 'Enter') { event.preventDefault(); return true; }
          return formatting.handleKeyDown(event);
        },
      },
      handlePaste: (_view, event) => {
        event.preventDefault();
        const html = event.clipboardData?.getData('text/html'), text = event.clipboardData?.getData('text/plain') ?? '';
        const pasted = html ? sanitizeDescription(html.slice(0, DESCRIPTION_MARKUP_LIMIT)) : text;
        const clean = singleLine ? pasted.replace(/<br\s*\/?>|[\r\n]+/gi, ' ') : pasted;
        if (editor && descriptionText(clean).length + editor.state.doc.textContent.length - (editor.state.selection.to - editor.state.selection.from) <= maxLength) editor.commands.insertContent(descriptionHtml(clean, { align: false }));
        else setLengthError(true);
        return true;
      },
      handleDrop: () => true,
    },
    onUpdate: ({ editor: current }) => {
      const next = editorValue(current, centerDefault);
      if (descriptionText(next).length > maxLength || next.length > DESCRIPTION_MARKUP_LIMIT) { current.commands.setContent(toHtml(value), { emitUpdate: false }); setLengthError(true); return; }
      setLengthError(false); if (next !== toClean(value)) onChange(next);
    },
  });
  // A value that arrives while the author is typing may be older than the editor text (React renders after the keystroke); the
  // field is only re-synchronised with the outside value while it is not focused, and once more when it loses the focus.
  useEffect(() => { if (editor && !focused && editorValue(editor, centerDefault) !== toClean(value)) editor.commands.setContent(toHtml(value), { emitUpdate: false }); }, [editor, value, focused, centerDefault, toClean, toHtml]);
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  formatting.editorRef.current = editor;
  return <div onFocus={(event) => { setFocused(true); onFocus?.(event); }} onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); onBlur?.(event); } }} style={{ minWidth: 0, maxWidth: '100%', width: '100%', display: 'grid', gap: 6 }}>
    <div id={labelId} className={hideLabel ? 'ui-visually-hidden' : undefined}>{descriptionText(label)}</div>
    <p id={hintId} className={compact || hideHint ? 'ui-visually-hidden' : 'admin-form__hint'} style={{ marginBlock: 4, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{t('richDescription.hint')}</p>
    <div {...formatting.touchProps}>
      {editor ? <EditorContent editor={editor} /> : <textarea id={id ?? uid} className={className} aria-labelledby={labelId} value={descriptionText(value)} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}
    </div>
    {lengthError && <p role="alert">{t('richDescription.limit', { count: maxLength })}</p>}
    {formatting.windowNode}
  </div>;
});

/**
 * Handlers are passed to the editor through stable wrappers that call the latest ones, so the (costly) editor is only
 * re-rendered when its own data changes -- not on every render of a parent such as a long list that is being dragged.
 */
export function RichTextField(props: RichTextFieldProps) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const handlers = useMemo(() => ({
    onChange: (value: string) => latest.current.onChange(value),
    onBlur: (event: Parameters<FocusEventHandler<HTMLDivElement>>[0]) => latest.current.onBlur?.(event),
    onFocus: (event: Parameters<FocusEventHandler<HTMLDivElement>>[0]) => latest.current.onFocus?.(event),
    onKeyDown: (event: Parameters<KeyboardEventHandler<HTMLDivElement>>[0]) => latest.current.onKeyDown?.(event),
  }), []);
  return <RichTextFieldInner {...props} {...handlers} />;
}

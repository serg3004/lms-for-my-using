import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, FocusEventHandler, KeyboardEventHandler } from 'react';
import { Mark, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useTranslation } from 'react-i18next';
import { DESCRIPTION_COLORS, DESCRIPTION_SIZES, DESCRIPTION_MARKUP_LIMIT, descriptionContrast, descriptionHtml, descriptionStyle, descriptionText, sanitizeDescription } from '@lms/shared/checklist-description';

const StyleMark = Mark.create({
  name: 'descriptionStyle',
  addAttributes: () => ({
    color: { default: null, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').color ?? null },
    size: { default: null, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').size ?? null },
    uppercase: { default: false, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').uppercase ?? false },
  }),
  parseHTML: () => [{ tag: 'span[style]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ style: [HTMLAttributes.color ? `color:${HTMLAttributes.color}` : '', HTMLAttributes.size ? `font-size:${HTMLAttributes.size}px` : '', HTMLAttributes.uppercase ? 'text-transform:uppercase' : ''].filter(Boolean).join(';') }), 0],
});
// Serialize the document model: DOM CSS serialization changes hex colours to rgb(), which the API intentionally rejects.
function editorValue(editor: Editor) {
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
    return node.type === 'paragraph' ? `<p>${children}</p>` : children;
  }
  return sanitizeDescription(serialize(editor.getJSON()));
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' };
const rowLabel: CSSProperties = { fontSize: 11, color: 'var(--color-text-muted, #6a6f86)', width: 62 };
const tool: CSSProperties = { minHeight: 32, height: 32, padding: '0 8px', fontSize: 13 };

type Popup = { from: number; to: number; x: number; y: number };

export function RichTextField({ value, onChange, label, id, maxLength = 2000, disabled = false, compact = false, singleLine = false, hideLabel = false, onBlur, onFocus, onKeyDown, invalid, describedBy, className }: {
  value: string; onChange: (value: string) => void; label: string; id?: string; maxLength?: number; disabled?: boolean; compact?: boolean; singleLine?: boolean; hideLabel?: boolean; onBlur?: FocusEventHandler<HTMLDivElement>; onFocus?: FocusEventHandler<HTMLDivElement>; onKeyDown?: KeyboardEventHandler<HTMLDivElement>; invalid?: boolean; describedBy?: string; className?: string;
}) {
  const { t } = useTranslation(), uid = useId(), labelId = `${uid}-label`, hintId = `${uid}-hint`;
  const [popup, setPopup] = useState<Popup | null>(null), [placement, setPlacement] = useState<CSSProperties>({}), [color, setColor] = useState<string>(DESCRIPTION_COLORS[0]), [lengthError, setLengthError] = useState(false), [focused, setFocused] = useState(false);
  const panel = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), touch = useRef<{ x: number; y: number } | null>(null);
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: true, editable: !disabled,
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, bulletList: false, orderedList: false, listItem: false, link: false, trailingNode: false, paragraph: { HTMLAttributes: { style: 'margin:0' } } }), StyleMark],
    content: descriptionHtml(value),
    editorProps: {
      attributes: { id: id ?? uid, role: 'textbox', 'aria-labelledby': labelId, 'aria-describedby': [hintId, describedBy].filter(Boolean).join(' '), 'aria-invalid': invalid ? 'true' : 'false', 'aria-multiline': singleLine ? 'false' : 'true', class: ['admin-textarea', className].filter(Boolean).join(' '), style: `min-height:${singleLine || compact ? 44 : 88}px;width:100%;box-sizing:border-box;font-size:16px;white-space:${singleLine ? 'nowrap' : 'pre-wrap'};overflow-x:auto;overflow-wrap:anywhere;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px 12px;background:var(--color-surface)` },
      handleDOMEvents: {
        contextmenu: (_view, event) => {
          if (!editor || editor.state.selection.empty || disabled) return false;
          event.preventDefault(); event.stopPropagation(); open(event.clientX, event.clientY); return true;
        },
        keydown: (_view, event) => {
          if (singleLine && event.key === 'Enter') { event.preventDefault(); return true; }
          if (!editor || editor.state.selection.empty || disabled || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return false;
          event.preventDefault(); event.stopPropagation(); const point = editor.view.coordsAtPos(editor.state.selection.from); open(point.left, point.bottom); return true;
        },
      },
      handlePaste: (_view, event) => {
        event.preventDefault();
        const html = event.clipboardData?.getData('text/html'), text = event.clipboardData?.getData('text/plain') ?? '';
        const pasted = html ? sanitizeDescription(html.slice(0, DESCRIPTION_MARKUP_LIMIT)) : text;
        const clean = singleLine ? pasted.replace(/<br\s*\/?>|[\r\n]+/gi, ' ') : pasted;
        if (editor && descriptionText(clean).length + editor.state.doc.textContent.length - (editor.state.selection.to - editor.state.selection.from) <= maxLength) editor.commands.insertContent(descriptionHtml(clean));
        else setLengthError(true);
        return true;
      },
      handleDrop: () => true,
    },
    onUpdate: ({ editor: current }) => {
      const clean = editorValue(current);
      if (descriptionText(clean).length > maxLength || clean.length > DESCRIPTION_MARKUP_LIMIT) { current.commands.setContent(descriptionHtml(value), { emitUpdate: false }); setLengthError(true); return; }
      setLengthError(false); if (clean !== sanitizeDescription(value)) onChange(clean);
    },
  });
  // A value that arrives while the author is typing may be older than the editor text (React renders after the keystroke); the
  // field is only re-synchronised with the outside value while it is not focused, and once more when it loses the focus.
  useEffect(() => { if (editor && !focused && editorValue(editor) !== sanitizeDescription(value)) editor.commands.setContent(descriptionHtml(value), { emitUpdate: false }); }, [editor, value, focused]);
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  function open(x: number, y: number) {
    if (!editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    setColor(String(editor.getAttributes('descriptionStyle').color ?? DESCRIPTION_COLORS[0])); setPopup({ from, to, x, y });
  }
  function close(restore = true) {
    setPopup(null);
    if (restore && popup && editor) { editor.commands.setTextSelection({ from: popup.from, to: popup.to }); editor.commands.focus(); }
  }
  useLayoutEffect(() => {
    if (!popup || !panel.current) return;
    const element = panel.current;
    const place = () => {
      const left = Math.max(8, Math.min(popup.x, document.documentElement.clientWidth - element.offsetWidth - 8));
      const top = Math.max(8, Math.min(popup.y, window.innerHeight - element.offsetHeight - 8));
      setPlacement((current) => current.left === left && current.top === top ? current : { left, top });
    };
    place();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [popup]);
  useEffect(() => {
    if (!popup) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab' && panel.current) {
        const fields = [...panel.current.querySelectorAll<HTMLElement>('button,input,select')].filter((element) => !element.hasAttribute('disabled'));
        if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
      }
    };
    const outside = (event: globalThis.PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setPopup(null); };
    const dismiss = () => setPopup(null);
    document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); };
    // Capture the selection that opened this window; applying a mark must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, editor]);
  function cancelTouch() { if (timer.current) clearTimeout(timer.current); timer.current = null; touch.current = null; }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function touchDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch' || !editor || editor.state.selection.empty || disabled) return;
    cancelTouch(); touch.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => open(event.clientX, event.clientY), 500);
  }
  function apply(kind: 'bold' | 'italic' | 'underline' | 'uppercase') {
    if (!popup || !editor) return;
    const chain = editor.chain().setTextSelection({ from: popup.from, to: popup.to });
    if (kind === 'uppercase') chain.setMark('descriptionStyle', { uppercase: !editor.getAttributes('descriptionStyle').uppercase }).run();
    else if (kind === 'bold') chain.toggleBold().run(); else if (kind === 'italic') chain.toggleItalic().run(); else chain.toggleUnderline().run();
  }
  function style(attributes: Record<string, unknown>) { if (popup) editor?.chain().setTextSelection({ from: popup.from, to: popup.to }).setMark('descriptionStyle', attributes).run(); }
  return <div onFocus={(event) => { setFocused(true); onFocus?.(event); }} onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); onBlur?.(event); } }} style={{ minWidth: 0, maxWidth: '100%', width: '100%', display: 'grid', gap: 6 }}>
    <div id={labelId} className={hideLabel ? 'ui-visually-hidden' : undefined}>{descriptionText(label)}</div>
    <p id={hintId} className={compact ? 'ui-visually-hidden' : 'admin-form__hint'} style={{ marginBlock: 4, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{t('richDescription.hint')}</p>
    <div onPointerDown={touchDown} onPointerUp={cancelTouch} onPointerCancel={cancelTouch} onPointerMove={(event) => { if (touch.current && Math.hypot(event.clientX - touch.current.x, event.clientY - touch.current.y) > 10) cancelTouch(); }}>
      {editor ? <EditorContent editor={editor} /> : <textarea id={id ?? uid} className={className} aria-labelledby={labelId} value={descriptionText(value)} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}
    </div>
    {lengthError && <p role="alert">{t('richDescription.limit', { count: maxLength })}</p>}
    {popup && <div ref={panel} role="dialog" aria-modal="true" aria-label={t('richDescription.title')} className="ds-menu__content" style={{ position: 'fixed', left: popup.x, top: popup.y, width: 'max-content', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', padding: 8, display: 'grid', gap: 8, ...placement }}>
      <div style={row}><span style={rowLabel}>{t('richDescription.weight')}</span>{(['bold', 'italic', 'underline', 'uppercase'] as const).map((kind) => <button key={kind} type="button" className="admin-btn admin-btn--secondary" aria-label={t(`richDescription.${kind}`)} aria-pressed={kind === 'uppercase' ? !!editor?.getAttributes('descriptionStyle').uppercase : editor?.isActive(kind) ?? false} onClick={() => apply(kind)} style={{ ...tool, minWidth: 36, fontWeight: kind === 'bold' ? 700 : undefined, fontStyle: kind === 'italic' ? 'italic' : undefined, textDecoration: kind === 'underline' ? 'underline' : undefined }}>{t(`richDescription.${kind}Short`)}</button>)}</div>
      <div role="group" aria-label={t('richDescription.size')} style={row}><span style={rowLabel}>{t('richDescription.size')}</span>{DESCRIPTION_SIZES.map((size, index) => <button key={size} type="button" className="admin-btn admin-btn--secondary" aria-pressed={Number(editor?.getAttributes('descriptionStyle').size ?? 16) === size} aria-label={`${t('richDescription.size')}: ${t(`richDescription.size${index}`)}`} onClick={() => style({ size })} style={{ ...tool, fontSize: [12, 14, 15, 17][index], fontWeight: index === 3 ? 700 : undefined }}>{t(`richDescription.size${index}`)}</button>)}</div>
      <div role="group" aria-label={t('richDescription.color')} style={row}><span style={rowLabel}>{t('richDescription.color')}</span>{DESCRIPTION_COLORS.map((value) => <button key={value} type="button" aria-label={`${t('richDescription.color')} ${value}`} aria-pressed={color.toUpperCase() === value} onClick={() => { setColor(value); style({ color: value }); }} style={{ width: 28, height: 28, minHeight: 28, borderRadius: '50%', padding: 0, background: value, border: color.toUpperCase() === value ? '2px solid var(--color-primary, #4f46e5)' : '2px solid var(--color-border)', cursor: 'pointer', flex: '0 0 28px' }} />)}<input aria-label={t('richDescription.customColor')} title={t('richDescription.customColor')} type="color" value={color} onChange={(event) => { setColor(event.target.value); style({ color: event.target.value.toUpperCase() }); }} style={{ width: 32, height: 32, border: 0, padding: 0, background: 'none', cursor: 'pointer' }} /></div>
      {descriptionContrast(color) < 4.5 && <p role="status" style={{ fontSize: 13, margin: 0 }}>{t('richDescription.lowContrast')}</p>}
      <div style={row}><button type="button" className="admin-btn admin-btn--secondary" style={tool} onClick={() => { if (popup) editor?.chain().setTextSelection({ from: popup.from, to: popup.to }).unsetAllMarks().run(); }}>{t('richDescription.reset')}</button></div>
    </div>}
  </div>;
}

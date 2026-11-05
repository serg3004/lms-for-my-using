import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
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

type Popup = { from: number; to: number; x: number; y: number };

export function RichDescriptionEditor({ value, onChange, label, id, maxLength = 2000, disabled = false, compact = false }: {
  value: string; onChange: (value: string) => void; label: string; id?: string; maxLength?: number; disabled?: boolean; compact?: boolean;
}) {
  const { t } = useTranslation(), uid = useId(), labelId = `${uid}-label`, hintId = `${uid}-hint`;
  const [popup, setPopup] = useState<Popup | null>(null), [placement, setPlacement] = useState<CSSProperties>({}), [color, setColor] = useState<string>(DESCRIPTION_COLORS[0]), [lengthError, setLengthError] = useState(false);
  const panel = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), touch = useRef<{ x: number; y: number } | null>(null);
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: true, editable: !disabled,
    extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, bulletList: false, orderedList: false, listItem: false, link: false, trailingNode: false, paragraph: { HTMLAttributes: { style: 'margin:0' } } }), StyleMark],
    content: descriptionHtml(value),
    editorProps: {
      attributes: { id: id ?? uid, role: 'textbox', 'aria-labelledby': labelId, 'aria-describedby': hintId, 'aria-multiline': 'true', class: 'admin-textarea', style: `min-height:${compact ? 44 : 88}px;width:100%;box-sizing:border-box;font-size:16px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px 12px;background:var(--color-surface)` },
      handleDOMEvents: {
        contextmenu: (_view, event) => {
          if (!editor || editor.state.selection.empty || disabled) return false;
          event.preventDefault(); event.stopPropagation(); open(event.clientX, event.clientY); return true;
        },
        keydown: (_view, event) => {
          if (!editor || editor.state.selection.empty || disabled || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return false;
          event.preventDefault(); event.stopPropagation(); const point = editor.view.coordsAtPos(editor.state.selection.from); open(point.left, point.bottom); return true;
        },
      },
      handlePaste: (_view, event) => {
        event.preventDefault();
        const html = event.clipboardData?.getData('text/html'), text = event.clipboardData?.getData('text/plain') ?? '';
        const clean = html ? sanitizeDescription(html.slice(0, DESCRIPTION_MARKUP_LIMIT)) : text;
        if (editor && descriptionText(clean).length + editor.state.doc.textContent.length - (editor.state.selection.to - editor.state.selection.from) <= maxLength) editor.commands.insertContent(descriptionHtml(clean));
        else setLengthError(true);
        return true;
      },
      handleDrop: () => true,
    },
    onUpdate: ({ editor: current }) => {
      const clean = editorValue(current);
      if (descriptionText(clean).length > maxLength || clean.length > DESCRIPTION_MARKUP_LIMIT) { current.commands.setContent(descriptionHtml(value), { emitUpdate: false }); setLengthError(true); return; }
      setLengthError(false); onChange(clean);
    },
  });
  useEffect(() => { if (editor && editorValue(editor) !== sanitizeDescription(value)) editor.commands.setContent(descriptionHtml(value), { emitUpdate: false }); }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
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
    const rect = { width: panel.current.offsetWidth, height: panel.current.offsetHeight };
    setPlacement({ left: Math.max(8, Math.min(popup.x, document.documentElement.clientWidth - rect.width - 8)), top: Math.max(8, Math.min(popup.y, window.innerHeight - rect.height - 8)) });
    panel.current.querySelector<HTMLButtonElement>('button')?.focus();
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
  return <div style={{ minWidth: 0, maxWidth: '100%', width: '100%', display: 'grid', gap: 6 }}>
    <div id={labelId}>{label}</div>
    <p id={hintId} className={compact ? 'ui-visually-hidden' : 'admin-form__hint'} style={{ marginBlock: 4, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{t('richDescription.hint')}</p>
    <div onPointerDown={touchDown} onPointerUp={cancelTouch} onPointerCancel={cancelTouch} onPointerMove={(event) => { if (touch.current && Math.hypot(event.clientX - touch.current.x, event.clientY - touch.current.y) > 10) cancelTouch(); }}>
      {editor ? <EditorContent editor={editor} /> : <textarea id={id ?? uid} aria-labelledby={labelId} value={descriptionText(value)} disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}
    </div>
    {lengthError && <p role="alert">{t('richDescription.limit', { count: maxLength })}</p>}
    {popup && <div ref={panel} role="dialog" aria-modal="true" aria-label={t('richDescription.title')} className="ds-menu__content" style={{ position: 'fixed', left: popup.x, top: popup.y, width: 280, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', padding: 12, ...placement }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{(['bold', 'italic', 'underline', 'uppercase'] as const).map((kind) => <button key={kind} type="button" className="admin-btn admin-btn--secondary" aria-label={t(`richDescription.${kind}`)} aria-pressed={kind === 'uppercase' ? !!editor?.getAttributes('descriptionStyle').uppercase : editor?.isActive(kind) ?? false} onClick={() => apply(kind)} style={{ minWidth: 44, minHeight: 44 }}>{t(`richDescription.${kind}Short`)}</button>)}</div>
      <label style={{ display: 'grid', gap: 4, marginBlock: 8 }}>{t('richDescription.size')}<select value={editor?.getAttributes('descriptionStyle').size ?? 16} onChange={(event) => style({ size: Number(event.target.value) })}>{DESCRIPTION_SIZES.map((size, index) => <option key={size} value={size}>{t(`richDescription.size${index}`)} · {size}</option>)}</select></label>
      <div role="group" aria-label={t('richDescription.color')} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{DESCRIPTION_COLORS.map((value) => <button key={value} type="button" className="admin-btn admin-btn--secondary" aria-label={`${t('richDescription.color')} ${value}`} onClick={() => { setColor(value); style({ color: value }); }} style={{ minWidth: 44, minHeight: 44, width: 44, padding: 0, flex: '0 0 44px' }}><span aria-hidden="true" style={{ background: value, width: 20, height: 20, borderRadius: '50%' }} /></button>)}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBlock: 8 }}>{t('richDescription.customColor')}<input aria-label={t('richDescription.customColor')} type="color" value={color} onChange={(event) => { setColor(event.target.value); style({ color: event.target.value.toUpperCase() }); }} style={{ width: 64, minHeight: 44 }} /></label>
      {descriptionContrast(color) < 4.5 && <p role="status" style={{ fontSize: 13 }}>{t('richDescription.lowContrast')}</p>}
      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => { if (popup) editor?.chain().setTextSelection({ from: popup.from, to: popup.to }).unsetAllMarks().run(); }}>{t('richDescription.reset')}</button>
      <button type="button" className="admin-btn admin-btn--secondary" onClick={() => close()}>{t('richDescription.close')}</button>
    </div>}
  </div>;
}

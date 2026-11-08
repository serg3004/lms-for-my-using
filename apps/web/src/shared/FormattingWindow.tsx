import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { Extension, Mark, mergeAttributes, type Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { DESCRIPTION_ALIGNS, DESCRIPTION_COLORS, DESCRIPTION_SIZES, descriptionContrast, descriptionStyle, type DescriptionAlign } from '@lms/shared/checklist-description';

export const StyleMark = Mark.create({
  name: 'descriptionStyle',
  addAttributes: () => ({
    color: { default: null, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').color ?? null },
    size: { default: null, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').size ?? null },
    uppercase: { default: false, parseHTML: (element) => descriptionStyle(element.getAttribute('style') ?? '').uppercase ?? false },
  }),
  parseHTML: () => [{ tag: 'span[style]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ style: [HTMLAttributes.color ? `color:${HTMLAttributes.color}` : '', HTMLAttributes.size ? `font-size:${HTMLAttributes.size}px` : '', HTMLAttributes.uppercase ? 'text-transform:uppercase' : ''].filter(Boolean).join(';') }), 0],
});

const alignOf = (value: unknown): DescriptionAlign => DESCRIPTION_ALIGNS.find((align) => align === value) ?? 'left';
const hasAlign = (editor: Editor | null) => !!editor?.schema.nodes.paragraph?.spec.attrs?.textAlign;

/** One alignment per field (PR 438): stored as an attribute of every paragraph, serialised from the first one. */
function setFieldAlign(editor: Editor, align: DescriptionAlign) {
  return editor.commands.command(({ state, tr }) => {
    state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.attrs.textAlign !== align) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align }); });
    return true;
  });
}

export const AlignExtension = Extension.create({
  name: 'descriptionAlign',
  addGlobalAttributes: () => [{ types: ['paragraph'], attributes: { textAlign: {
    default: 'left',
    parseHTML: (element) => alignOf(element.style.textAlign),
    renderHTML: (attributes) => attributes.textAlign && attributes.textAlign !== 'left' ? { style: `text-align:${attributes.textAlign}` } : {},
  } } }],
  addKeyboardShortcuts() {
    return { 'Mod-Shift-l': () => setFieldAlign(this.editor, 'left'), 'Mod-Shift-e': () => setFieldAlign(this.editor, 'center'), 'Mod-Shift-r': () => setFieldAlign(this.editor, 'right'), 'Mod-Shift-j': () => setFieldAlign(this.editor, 'justify') };
  },
});

// Lines of different length inside a 14 px box: the same pictograms as in word processors.
const ALIGN_LINES: Record<DescriptionAlign, [number, number][]> = {
  left: [[1, 13], [1, 9], [1, 13], [1, 7]], center: [[1, 13], [3, 11], [1, 13], [4, 10]], right: [[1, 13], [5, 13], [1, 13], [7, 13]], justify: [[1, 13], [1, 13], [1, 13], [1, 13]],
};
const AlignIcon = ({ align }: { align: DescriptionAlign }) => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">{ALIGN_LINES[align].map(([from, to], index) => <line key={index} x1={from} x2={to} y1={2 + index * 3.3} y2={2 + index * 3.3} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)}</svg>;

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' };
const rowLabel: CSSProperties = { fontSize: 11, color: 'var(--color-text-muted, #6a6f86)', width: 82 };
const tool: CSSProperties = { minHeight: 32, height: 32, padding: '0 8px', fontSize: 13 };

type Popup = { from: number; to: number; x: number; y: number };

/**
 * The formatting window shared by every rich text editor (sheet fields, descriptions of other modules, longread blocks):
 * opened by the right button, the context-menu key / Shift+F10 or a long touch on a selection. The host passes the
 * returned handlers to its editor and renders `windowNode` beside it.
 */
export function useFormattingWindow(disabled: boolean) {
  const { t } = useTranslation();
  const editorRef = useRef<Editor | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null), [placement, setPlacement] = useState<CSSProperties>({}), [color, setColor] = useState<string>(DESCRIPTION_COLORS[0]);
  const panel = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), touch = useRef<{ x: number; y: number } | null>(null);
  const editor = editorRef.current;
  function open(x: number, y: number) {
    const current = editorRef.current;
    if (!current || current.state.selection.empty) return;
    const { from, to } = current.state.selection;
    setColor(String(current.getAttributes('descriptionStyle').color ?? DESCRIPTION_COLORS[0])); setPopup({ from, to, x, y });
  }
  function close(restore = true) {
    setPopup(null);
    const current = editorRef.current;
    if (restore && popup && current) { current.commands.setTextSelection({ from: popup.from, to: popup.to }); current.commands.focus(); }
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
  const handleContextMenu = (event: MouseEvent): boolean => {
    const current = editorRef.current;
    if (!current || current.state.selection.empty || disabled) return false;
    event.preventDefault(); event.stopPropagation(); open(event.clientX, event.clientY); return true;
  };
  const handleKeyDown = (event: KeyboardEvent): boolean => {
    const current = editorRef.current;
    if (!current || current.state.selection.empty || disabled || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return false;
    event.preventDefault(); event.stopPropagation(); const point = current.view.coordsAtPos(current.state.selection.from); open(point.left, point.bottom); return true;
  };
  const touchProps = { onPointerDown: touchDown, onPointerUp: cancelTouch, onPointerCancel: cancelTouch, onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (touch.current && Math.hypot(event.clientX - touch.current.x, event.clientY - touch.current.y) > 10) cancelTouch(); } };
  const windowNode = popup && <div ref={panel} role="dialog" aria-modal="true" aria-label={t('richDescription.title')} className="ds-menu__content" style={{ position: 'fixed', left: popup.x, top: popup.y, width: 'max-content', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', padding: 8, display: 'grid', gap: 8, ...placement }}>
      <div style={row}><span style={rowLabel}>{t('richDescription.weight')}</span>{(['bold', 'italic', 'underline', 'uppercase'] as const).map((kind) => <button key={kind} type="button" className="admin-btn admin-btn--secondary" aria-label={t(`richDescription.${kind}`)} aria-pressed={kind === 'uppercase' ? !!editor?.getAttributes('descriptionStyle').uppercase : editor?.isActive(kind) ?? false} onClick={() => apply(kind)} style={{ ...tool, minWidth: 36, fontWeight: kind === 'bold' ? 700 : undefined, fontStyle: kind === 'italic' ? 'italic' : undefined, textDecoration: kind === 'underline' ? 'underline' : undefined }}>{t(`richDescription.${kind}Short`)}</button>)}</div>
      <div role="group" aria-label={t('richDescription.size')} style={row}><span style={rowLabel}>{t('richDescription.size')}</span>{DESCRIPTION_SIZES.map((size, index) => <button key={size} type="button" className="admin-btn admin-btn--secondary" aria-pressed={Number(editor?.getAttributes('descriptionStyle').size ?? 16) === size} aria-label={`${t('richDescription.size')}: ${t(`richDescription.size${index}`)}`} onClick={() => style({ size })} style={{ ...tool, fontSize: [12, 14, 15, 17][index], fontWeight: index === 3 ? 700 : undefined }}>{t(`richDescription.size${index}`)}</button>)}</div>
      <div role="group" aria-label={t('richDescription.color')} style={row}><span style={rowLabel}>{t('richDescription.color')}</span>{DESCRIPTION_COLORS.map((value) => <button key={value} type="button" aria-label={`${t('richDescription.color')} ${value}`} aria-pressed={color.toUpperCase() === value} onClick={() => { setColor(value); style({ color: value }); }} style={{ width: 28, height: 28, minHeight: 28, borderRadius: '50%', padding: 0, background: value, border: color.toUpperCase() === value ? '2px solid var(--color-primary, #4f46e5)' : '2px solid var(--color-border)', cursor: 'pointer', flex: '0 0 28px' }} />)}<input aria-label={t('richDescription.customColor')} title={t('richDescription.customColor')} type="color" value={color} onChange={(event) => { setColor(event.target.value); style({ color: event.target.value.toUpperCase() }); }} style={{ width: 32, height: 32, border: 0, padding: 0, background: 'none', cursor: 'pointer' }} /></div>
      {descriptionContrast(color) < 4.5 && <p role="status" style={{ fontSize: 13, margin: 0 }}>{t('richDescription.lowContrast')}</p>}
      {hasAlign(editor) && <div role="group" aria-label={t('richDescription.align')} style={row}><span style={rowLabel}>{t('richDescription.align')}</span>{DESCRIPTION_ALIGNS.map((value) => <button key={value} type="button" className="admin-btn admin-btn--secondary" aria-label={t(`richDescription.align_${value}`)} title={t(`richDescription.align_${value}`)} aria-pressed={alignOf(editor?.state.doc.firstChild?.attrs.textAlign) === value} onClick={() => { if (editor) { editor.chain().setTextSelection({ from: popup.from, to: popup.to }).run(); setFieldAlign(editor, value); } }} style={{ ...tool, minWidth: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><AlignIcon align={value} /></button>)}</div>}
      <div style={row}><button type="button" className="admin-btn admin-btn--secondary" style={tool} onClick={() => { if (popup && editor) { editor.chain().setTextSelection({ from: popup.from, to: popup.to }).unsetAllMarks().run(); if (hasAlign(editor)) setFieldAlign(editor, 'left'); } }}>{t('richDescription.reset')}</button></div>
    </div>;
  return { editorRef, handleContextMenu, handleKeyDown, touchProps, windowNode };
}

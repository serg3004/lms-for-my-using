import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { apiDownloadRequest } from '../../shared/apiClient.js';
import { Button } from '../../shared/ui.js';
import {
  MAX_FILE_BYTES, boxOf, clipBox, fitSize, isDrag, nextNumber, textWidth, toPicture, tools,
  type DragTool, type Point, type Shape, type Tool,
} from './image-editor-model.js';
import { cropCanvas, drawAll, flatten } from './image-editor-render.js';

type Snapshot = { base: HTMLCanvasElement; shapes: Shape[] };
const colors = [['red', '#e11d48'], ['blue', '#2563eb'], ['green', '#16a34a'], ['yellow', '#facc15'], ['black', '#111827'], ['white', '#ffffff']] as const;
const widths = [['thin', 1], ['medium', 2], ['thick', 4]] as const;
const sizes = [['small', 1], ['medium', 1.6], ['large', 2.6]] as const;

async function load(fileId: string) {
  const { blob } = await apiDownloadRequest(`/assessment-images/${encodeURIComponent(fileId)}/content`);
  const bitmap = await createImageBitmap(blob);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const base = document.createElement('canvas');
  base.width = width; base.height = height;
  base.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return base;
}

/** The file for upload: PNG when it fits, otherwise a lighter format. */
export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const [type, quality] of [['image/png', undefined], ['image/webp', 0.9], ['image/jpeg', 0.88]] as const) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && blob.type === type && blob.size <= MAX_FILE_BYTES) return blob;
  }
  return null;
}

/**
 * PR 541: edits a question picture on a canvas in the browser. The editor never changes the stored file: it makes a new one
 * from what is on the canvas, and the caller keeps the original.
 */
export function ImageEditor({ fileId, onClose, onSave }: { fileId: string; onClose: () => void; onSave: (blob: Blob) => Promise<void> }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState<Snapshot>();
  const [past, setPast] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error' | 'saveError'>('loading');
  const [tool, setTool] = useState<Tool>('rect');
  const [color, setColor] = useState<string>(colors[0][1]);
  const [width, setWidth] = useState(2);
  const [size, setSize] = useState(1.6);
  const [fill, setFill] = useState(false);
  const [curved, setCurved] = useState(false);
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [drag, setDrag] = useState<{ tool: DragTool; from: Point; to: Point }>();
  const [pendingText, setPendingText] = useState<Point>();
  const [text, setText] = useState('');
  // Line widths and text sizes are chosen in screen-like steps and scaled to the size of the picture.
  const unit = current ? Math.max(1, Math.max(current.base.width, current.base.height) / 600) : 1;

  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    load(fileId).then((base) => { if (active) { setCurrent({ base, shapes: [] }); setStatus('ready'); } }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [fileId]);

  const draft = useMemo<Shape | null>(() => {
    if (!drag) return null;
    const { tool: kind, from, to } = drag;
    if (kind === 'rect') return { kind, a: from, b: to, color, width: width * unit * 1.5, fill };
    if (kind === 'arrow') return { kind, a: from, b: to, color, width: width * unit * 1.5, curved };
    if (kind === 'loupe') return { kind, a: from, b: to, zoom: 2 };
    if (kind === 'fill') return { kind, a: from, b: to, color };
    if (kind === 'highlight') return { kind, a: from, b: to, color };
    if (kind === 'crop') return { kind: 'rect', a: from, b: to, color: '#ffffff', width: 2 * unit, fill: false };
    return { kind, a: from, b: to };
  }, [drag, color, width, fill, curved, unit]);

  useEffect(() => {
    const surface = canvas.current?.getContext('2d');
    if (surface && current) drawAll(surface, current.base, current.shapes, draft);
  }, [current, draft]);

  function commit(next: Snapshot) {
    if (current) setPast((previous) => [...previous, current]);
    setCurrent(next);
  }

  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const element = canvas.current!;
    return toPicture({ x: event.clientX, y: event.clientY }, element.getBoundingClientRect(), element);
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!current || status !== 'ready') return;
    const at = point(event);
    if (tool === 'text') { setPendingText(at); setText(''); return; }
    if (tool === 'number') {
      commit({ ...current, shapes: [...current.shapes, { kind: 'number', at, n: nextNumber(current.shapes), color, size: 18 * unit * (size / 1.6) }] });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ tool: tool as DragTool, from: at, to: at });
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (drag) setDrag({ ...drag, to: point(event) });
  }

  function up() {
    if (!drag || !current) return;
    const finished = drag;
    setDrag(undefined);
    if (!isDrag(finished.from, finished.to)) return;
    if (finished.tool === 'crop') {
      const box = clipBox(boxOf(finished.from, finished.to), current.base.width, current.base.height);
      if (!box) return;
      // The shapes drawn so far are burnt in first, so the cropped picture is what the author sees.
      commit({ base: cropCanvas(flatten(current.base, current.shapes), box), shapes: [] });
      return;
    }
    if (!draft) return;
    commit({ ...current, shapes: [...current.shapes, draft] });
  }

  function addText() {
    if (!current || !pendingText || !text.trim()) return;
    const fontSize = 18 * unit * size;
    commit({ ...current, shapes: [...current.shapes, { kind: 'text', at: pendingText, text: text.trim(), color, size: fontSize, bold, italic,
      maxWidth: textWidth(current.base, pendingText, fontSize) }] });
    setPendingText(undefined); setText('');
  }

  async function save() {
    if (!current) return;
    setStatus('saving');
    try {
      const blob = await encodeCanvas(flatten(current.base, current.shapes));
      if (!blob) throw new Error('too large');
      await onSave(blob);
    } catch {
      setStatus('saveError');
    }
  }

  const busy = status !== 'ready' && status !== 'saveError';
  return <dialog ref={dialog} aria-label={t('imageEditor.title')} onClose={onClose} onCancel={(event) => { if (status === 'saving') event.preventDefault(); }}
    style={{ width: 'min(98vw, 1100px)', maxHeight: '96vh', boxSizing: 'border-box', padding: 12, overflow: 'auto' }}>
    <div style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>{t('imageEditor.title')}</h2>
      <div role="toolbar" aria-label={t('imageEditor.tools')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tools.map((item) => <Button key={item} type="button" size="sm" variant={tool === item ? 'primary' : 'secondary'} aria-pressed={tool === item}
          disabled={busy} style={{ minHeight: 44 }} onClick={() => { setTool(item); setPendingText(undefined); }}>{t(`imageEditor.tool.${item}`)}</Button>)}
        <Button type="button" size="sm" variant="secondary" disabled={busy || !past.length} style={{ minHeight: 44 }} onClick={() => {
          setCurrent(past[past.length - 1]); setPast(past.slice(0, -1));
        }}>{t('imageEditor.undo')}</Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {tool !== 'crop' && tool !== 'darken' && tool !== 'pixelate' && tool !== 'loupe' && <div role="group" aria-label={t('imageEditor.color')} style={{ display: 'flex', gap: 6 }}>
          {colors.map(([name, value]) => <button key={name} type="button" aria-label={t(`imageEditor.colors.${name}`)} aria-pressed={color === value}
            onClick={() => setColor(value)} style={{ width: 44, height: 44, borderRadius: 22, background: value, cursor: 'pointer',
              border: color === value ? '3px solid var(--color-primary, #2563eb)' : '2px solid #94a3b8' }} />)}
        </div>}
        {(tool === 'rect' || tool === 'arrow') && <label>{t('imageEditor.width')}{' '}
          <select value={width} onChange={(event) => setWidth(Number(event.target.value))} style={{ minHeight: 44 }}>
            {widths.map(([name, value]) => <option key={name} value={value}>{t(`imageEditor.widths.${name}`)}</option>)}
          </select></label>}
        {tool === 'rect' && <label><input type="checkbox" checked={fill} onChange={(event) => setFill(event.target.checked)} /> {t('imageEditor.fillShape')}</label>}
        {tool === 'arrow' && <label><input type="checkbox" checked={curved} onChange={(event) => setCurved(event.target.checked)} /> {t('imageEditor.curved')}</label>}
        {(tool === 'text' || tool === 'number') && <label>{t('imageEditor.size')}{' '}
          <select value={size} onChange={(event) => setSize(Number(event.target.value))} style={{ minHeight: 44 }}>
            {sizes.map(([name, value]) => <option key={name} value={value}>{t(`imageEditor.sizes.${name}`)}</option>)}
          </select></label>}
        {tool === 'text' && <>
          <label><input type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /> {t('imageEditor.bold')}</label>
          <label><input type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /> {t('imageEditor.italic')}</label>
        </>}
      </div>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{t(`imageEditor.hint.${tool}`)}</p>
      {pendingText && <form style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} onSubmit={(event) => { event.preventDefault(); addText(); }}>
        <textarea aria-label={t('imageEditor.textLabel')} value={text} autoFocus rows={2} maxLength={500} onChange={(event) => setText(event.target.value)}
          style={{ flex: '1 1 220px', minWidth: 0 }} />
        <Button type="submit" variant="primary" disabled={!text.trim()} style={{ minHeight: 44 }}>{t('imageEditor.addText')}</Button>
      </form>}
      {status === 'loading' && <p role="status">{t('imageEditor.loading')}</p>}
      {status === 'error' && <p role="alert">{t('imageEditor.loadError')}</p>}
      {status === 'saveError' && <p role="alert">{t('imageEditor.saveError')}</p>}
      <div style={{ overflow: 'auto', maxWidth: '100%' }}>
        <canvas ref={canvas} data-testid="image-editor-canvas" aria-label={t('imageEditor.canvas')} role="img"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(undefined)}
          style={{ display: current ? 'block' : 'none', maxWidth: '100%', height: 'auto', touchAction: 'none', cursor: 'crosshair', background: '#e2e8f0', margin: '0 auto' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" disabled={status === 'saving'} style={{ minHeight: 44 }} onClick={() => dialog.current?.close()}>{t('imageEditor.cancel')}</Button>
        <Button type="button" variant="primary" disabled={busy} style={{ minHeight: 44 }} onClick={() => void save()}>
          {t(status === 'saving' ? 'imageEditor.saving' : 'imageEditor.save')}</Button>
      </div>
    </div>
  </dialog>;
}


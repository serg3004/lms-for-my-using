import { arrowAngle, boxOf, clipBox, curveControl, wrapText, type Point, type Shape } from './image-editor-model.js';

type Surface = CanvasRenderingContext2D;

function arrow(ctx: Surface, shape: Extract<Shape, { kind: 'arrow' }>) {
  const { a, b, color, width, curved } = shape;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const angle = arrowAngle(a, b, curved);
  const head = Math.max(10, width * 4);
  // The line stops inside the head so a thick line does not poke out of its point.
  const end = { x: b.x - Math.cos(angle) * head * 0.6, y: b.y - Math.sin(angle) * head * 0.6 };
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (curved) { const c = curveControl(a, b); ctx.quadraticCurveTo(c.x, c.y, end.x, end.y); } else ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function copyOf(source: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const copy = document.createElement('canvas');
  copy.width = Math.max(1, Math.round(width)); copy.height = Math.max(1, Math.round(height));
  copy.getContext('2d')!.drawImage(source, x, y, width, height, 0, 0, copy.width, copy.height);
  return copy;
}

/** Draws one shape over what is already on the canvas: the blurring and magnifying shapes read the picture drawn so far. */
export function drawShape(ctx: Surface, shape: Shape) {
  const canvas = ctx.canvas;
  if (shape.kind === 'arrow') return arrow(ctx, shape);
  ctx.save();
  if (shape.kind === 'rect') {
    const { x, y, width, height } = boxOf(shape.a, shape.b);
    if (shape.fill) { ctx.fillStyle = shape.color; ctx.fillRect(x, y, width, height); }
    else { ctx.strokeStyle = shape.color; ctx.lineWidth = shape.width; ctx.lineJoin = 'round'; ctx.strokeRect(x, y, width, height); }
  } else if (shape.kind === 'highlight') {
    const { x, y, width, height } = boxOf(shape.a, shape.b);
    ctx.globalAlpha = 0.38; ctx.fillStyle = shape.color; ctx.fillRect(x, y, width, height);
  } else if (shape.kind === 'darken') {
    const { x, y, width, height } = boxOf(shape.a, shape.b);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(x, y, width, height);
  } else if (shape.kind === 'fill') {
    const { x, y, width, height } = boxOf(shape.a, shape.b);
    ctx.fillStyle = shape.color; ctx.fillRect(x, y, width, height);
  } else if (shape.kind === 'pixelate') {
    const box = clipBox(boxOf(shape.a, shape.b), canvas.width, canvas.height);
    if (box) {
      const block = Math.max(6, Math.round(Math.min(box.width, box.height) / 8));
      const small = copyOf(canvas, box.x, box.y, Math.max(1, box.width / block), Math.max(1, box.height / block));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width, small.height, box.x, box.y, box.width, box.height);
    }
  } else if (shape.kind === 'loupe') {
    const radius = Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y);
    if (radius >= 1) {
      const source = copyOf(canvas, 0, 0, canvas.width, canvas.height);
      ctx.beginPath(); ctx.arc(shape.a.x, shape.a.y, radius, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(source, shape.a.x - radius / shape.zoom, shape.a.y - radius / shape.zoom, 2 * radius / shape.zoom, 2 * radius / shape.zoom,
        shape.a.x - radius, shape.a.y - radius, 2 * radius, 2 * radius);
      ctx.restore(); ctx.save();
      ctx.beginPath(); ctx.arc(shape.a.x, shape.a.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(3, radius / 20); ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  } else if (shape.kind === 'number') {
    const radius = shape.size / 2 + 4;
    ctx.beginPath(); ctx.arc(shape.at.x, shape.at.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = shape.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${shape.size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(shape.n), shape.at.x, shape.at.y + 1);
  } else if (shape.kind === 'text') {
    ctx.font = `${shape.italic ? 'italic ' : ''}${shape.bold ? '700' : '400'} ${shape.size}px system-ui, sans-serif`;
    ctx.textBaseline = 'top'; ctx.fillStyle = shape.color;
    const lines = wrapText(shape.text, shape.maxWidth, (value) => ctx.measureText(value).width);
    // A light outline keeps the text readable on a picture of any colour.
    ctx.lineWidth = Math.max(2, shape.size / 8); ctx.lineJoin = 'round'; ctx.strokeStyle = shape.color === '#ffffff' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.85)';
    lines.forEach((line, index) => {
      const y = shape.at.y + index * shape.size * 1.25;
      ctx.strokeText(line, shape.at.x, y); ctx.fillText(line, shape.at.x, y);
    });
  }
  ctx.restore();
}

export function drawAll(ctx: Surface, base: HTMLCanvasElement, shapes: readonly Shape[], draft?: Shape | null) {
  ctx.canvas.width = base.width; ctx.canvas.height = base.height;
  ctx.drawImage(base, 0, 0);
  for (const shape of shapes) drawShape(ctx, shape);
  if (draft) drawShape(ctx, draft);
}

/** The picture with the shapes burnt in, as a new canvas. */
export function flatten(base: HTMLCanvasElement, shapes: readonly Shape[]) {
  const canvas = document.createElement('canvas');
  drawAll(canvas.getContext('2d')!, base, shapes);
  return canvas;
}

export function cropCanvas(base: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  return copyOf(base, Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height));
}

export type { Point };

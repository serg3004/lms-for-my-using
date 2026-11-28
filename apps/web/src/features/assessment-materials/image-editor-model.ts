/** PR 541: the shapes of the image editor and the arithmetic around them. Coordinates are pixels of the picture, not of the screen. */
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

export type Shape =
  | { kind: 'rect'; a: Point; b: Point; color: string; width: number; fill: boolean }
  | { kind: 'arrow'; a: Point; b: Point; color: string; width: number; curved: boolean }
  | { kind: 'text'; at: Point; text: string; color: string; size: number; bold: boolean; italic: boolean; maxWidth: number }
  | { kind: 'loupe'; a: Point; b: Point; zoom: number }
  | { kind: 'darken'; a: Point; b: Point }
  | { kind: 'pixelate'; a: Point; b: Point }
  | { kind: 'fill'; a: Point; b: Point; color: string }
  | { kind: 'number'; at: Point; n: number; color: string; size: number }
  | { kind: 'highlight'; a: Point; b: Point; color: string };

export type DragTool = 'rect' | 'arrow' | 'loupe' | 'darken' | 'pixelate' | 'fill' | 'highlight' | 'crop';
export type Tool = DragTool | 'text' | 'number';
export const dragTools: readonly Tool[] = ['rect', 'arrow', 'loupe', 'darken', 'pixelate', 'fill', 'highlight', 'crop'];
export const tools: readonly Tool[] = ['rect', 'arrow', 'text', 'crop', 'loupe', 'darken', 'pixelate', 'fill', 'number', 'highlight'];

/** The longest side of the working picture: a larger photo is reduced once so the canvas and the saved file stay light. */
export const MAX_SIDE = 2400;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MIN_DRAG = 4;

export function boxOf(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** The box clipped to the picture; null when nothing of it is left. */
export function clipBox(box: Box, width: number, height: number): Box | null {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  const right = Math.min(width, box.x + box.width), bottom = Math.min(height, box.y + box.height);
  return right - x >= 1 && bottom - y >= 1 ? { x, y, width: right - x, height: bottom - y } : null;
}

export function fitSize(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** Screen point to picture point, for a canvas that is shown smaller or larger than its pixels. */
export function toPicture(client: Point, rect: { left: number; top: number; width: number; height: number }, picture: { width: number; height: number }): Point {
  return {
    x: ((client.x - rect.left) / (rect.width || 1)) * picture.width,
    y: ((client.y - rect.top) / (rect.height || 1)) * picture.height,
  };
}

/** The control point of a curved arrow: the middle of the line pushed to the side by a quarter of its length. */
export function curveControl(a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: (a.x + b.x) / 2 - dy * 0.25, y: (a.y + b.y) / 2 + dx * 0.25 };
}

/** The angle the arrow head points along: the end of the line, or the tangent at the end of the curve. */
export function arrowAngle(a: Point, b: Point, curved: boolean): number {
  const from = curved ? curveControl(a, b) : a;
  return Math.atan2(b.y - from.y, b.x - from.x);
}

/** Words wrapped into lines no wider than `maxWidth`; a word wider than that is cut. `measure` gives the width of a string. */
export function wrapText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth || !line && measure(word) <= maxWidth) { line = next; continue; }
      if (line) lines.push(line);
      line = word;
      while (measure(line) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The next number for the numbering tool: after the largest on the picture, so a removed step leaves no clash. */
export function nextNumber(shapes: readonly Shape[]): number {
  return shapes.reduce((max, shape) => shape.kind === 'number' ? Math.max(max, shape.n) : max, 0) + 1;
}

/** A shape moved by `-origin`: after a crop the picture starts at the crop corner. */
export function shiftShape(shape: Shape, origin: Point): Shape {
  const move = (point: Point) => ({ x: point.x - origin.x, y: point.y - origin.y });
  if ('at' in shape) return { ...shape, at: move(shape.at) };
  return { ...shape, a: move(shape.a), b: move(shape.b) };
}

/** Whether a finished drag is a real shape and not a tap. */
export function isDrag(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) >= MIN_DRAG || Math.abs(a.y - b.y) >= MIN_DRAG;
}

/** The size of a text box that the pointer drag chose, or a default one when the author only tapped. */
export function textWidth(picture: { width: number }, at: Point, size: number): number {
  return Math.max(size * 4, Math.min(picture.width - at.x - 8, picture.width * 0.6));
}

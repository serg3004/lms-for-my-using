import { assessmentMaterialSchema } from '@lms/shared/longread-media';
import { describe, expect, it } from 'vitest';

import { boxOf, clipBox, fitSize, isDrag, nextNumber, toPicture, wrapText, type Shape } from './image-editor-model.js';

const measure = (value: string) => value.length * 10;

describe('image editor model', () => {
  it('orders a drag into a box in any direction', () => {
    expect(boxOf({ x: 50, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 40, height: 30 });
  });

  it('clips a crop box to the picture and rejects an empty one', () => {
    expect(clipBox({ x: -10, y: 5, width: 50, height: 500 }, 100, 80)).toEqual({ x: 0, y: 5, width: 40, height: 75 });
    expect(clipBox({ x: 200, y: 0, width: 10, height: 10 }, 100, 80)).toBeNull();
  });

  it('reduces only large pictures and keeps the proportions', () => {
    expect(fitSize(4800, 2400)).toMatchObject({ width: 2400, height: 1200, scale: 0.5 });
    expect(fitSize(800, 600)).toMatchObject({ width: 800, height: 600, scale: 1 });
  });

  it('maps a pointer position on a scaled canvas to picture pixels', () => {
    expect(toPicture({ x: 150, y: 120 }, { left: 100, top: 100, width: 200, height: 100 }, { width: 1000, height: 400 })).toEqual({ x: 250, y: 80 });
  });

  it('wraps text by words, long words and line breaks', () => {
    expect(wrapText('aa bb cc', 50, measure)).toEqual(['aa bb', 'cc']);
    expect(wrapText('abcdefgh', 30, measure)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText('a\nb', 100, measure)).toEqual(['a', 'b']);
  });

  it('continues numbering after the highest number', () => {
    const shape = (n: number): Shape => ({ kind: 'number', at: { x: 0, y: 0 }, n, color: '#000', size: 10 });
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([shape(1), shape(4)])).toBe(5);
  });

  it('tells a drag from a tap', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe(true);
  });

  it('keeps the original id in an edited file material', () => {
    const parsed = assessmentMaterialSchema.safeParse(JSON.stringify({ kind: 'file', fileId: `${crypto.randomUUID()}.png`, originalId: `${crypto.randomUUID()}.jpg`, caption: '', alt: '' }));
    expect(parsed.success).toBe(true);
    expect(parsed.success && JSON.parse(parsed.data).originalId).toMatch(/\.jpg$/);
  });
});

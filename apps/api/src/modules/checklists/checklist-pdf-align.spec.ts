import { alignLine } from './checklist-pdf-align.js';

const word = (width: number) => ({ width, space: false });
const space = (width: number) => ({ width, space: true });
const line = [word(40), space(5), word(30), space(5)];

describe('PDF line alignment (PR 439)', () => {
  it('leaves a left line exactly as laid out', () => {
    expect(alignLine('left', line, 200, false)).toEqual({ start: 0, widths: [40, 5, 30, 5] });
  });
  it('centres and right-aligns by the visible text, ignoring trailing spaces', () => {
    expect(alignLine('center', line, 200, false)).toEqual({ start: (200 - 75) / 2, widths: [40, 5, 30, 0] });
    expect(alignLine('right', line, 200, true)).toEqual({ start: 200 - 75, widths: [40, 5, 30, 0] });
  });
  it('justifies by widening only the gaps between words, so the line ends at the right edge', () => {
    const placed = alignLine('justify', [word(40), space(5), word(30), space(5), word(20), space(5)], 200, false);
    expect(placed.start).toBe(0);
    expect(placed.widths[5]).toBe(0);
    expect(placed.widths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(200);
    expect(placed.widths[1]).toBeCloseTo(placed.widths[3]!);
  });
  it('keeps the last line of a paragraph, a broken line and a single word at the left when justified', () => {
    expect(alignLine('justify', line, 200, true).widths).toEqual([40, 5, 30, 0]);
    expect(alignLine('justify', [word(40)], 200, false).widths).toEqual([40]);
    expect(alignLine('justify', [], 200, false)).toEqual({ start: 0, widths: [] });
  });
  it('never moves text left of the margin when a line is wider than the box', () => {
    expect(alignLine('center', [word(300)], 200, false).start).toBe(0);
    expect(alignLine('right', [word(300)], 200, false).start).toBe(0);
  });
});

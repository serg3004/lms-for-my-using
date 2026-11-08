import type { DescriptionAlign } from '@lms/shared/checklist-description';

export type LinePart = { width: number; space: boolean };

/**
 * PR 439: horizontal placement of one hand-laid PDF line. `center` and `right` ignore the trailing spaces (they would shift
 * the visible text), `justify` widens the gaps between words so the line reaches the right edge, except on the last line of a
 * paragraph and on a line ended by an explicit break, which stay at the left. Returns the start offset and the width of
 * every part, so the caller draws the parts one after another.
 */
export function alignLine(align: DescriptionAlign, parts: LinePart[], available: number, endsParagraph: boolean): { start: number; widths: number[] } {
  const widths = parts.map((part) => part.width);
  if (align === 'left') return { start: 0, widths };
  let last = parts.length - 1;
  while (last >= 0 && parts[last]!.space) { widths[last] = 0; last--; }
  let first = 0;
  while (first <= last && parts[first]!.space && align !== 'justify') first++;
  const used = widths.reduce((sum, value) => sum + value, 0);
  const free = Math.max(0, available - used);
  if (align === 'center') return { start: free / 2, widths };
  if (align === 'right') return { start: free, widths };
  const gaps = parts.map((part, index) => part.space && index > first && index <= last).filter(Boolean).length;
  if (endsParagraph || !gaps || free <= 0) return { start: 0, widths };
  return { start: 0, widths: widths.map((value, index) => parts[index]!.space && index > first && index <= last ? value + free / gaps : value) };
}

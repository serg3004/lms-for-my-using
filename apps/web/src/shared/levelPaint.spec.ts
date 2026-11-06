import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_COLORS, defaultLevelColor, levelContrast, levelPaint } from './levelPaint';

describe('levelPaint (PR 425)', () => {
  it('colours a level by its share of the best score', () => {
    expect(defaultLevelColor(0, 10)).toBe(DEFAULT_LEVEL_COLORS.zero);
    expect(defaultLevelColor(10, 10)).toBe(DEFAULT_LEVEL_COLORS.full);
    expect(defaultLevelColor(5, 10)).toBe(DEFAULT_LEVEL_COLORS.partial);
  });

  it('keeps the text readable (WCAG AA) on the wash of any owner colour', () => {
    for (const color of ['#2E7D32', '#E65100', '#C62828', '#F9A825', '#000000', '#FFFFFF', '#1565C0', '#7B1FA2']) {
      const paint = levelPaint(color);
      expect(levelContrast(paint.background, paint.color)).toBeGreaterThanOrEqual(4.5);
      expect(paint.borderColor).toBe(color);
    }
  });

  it('falls back to a safe colour for anything that is not #RRGGBB', () => {
    expect(levelPaint('red').borderColor).toBe(DEFAULT_LEVEL_COLORS.partial);
  });
});

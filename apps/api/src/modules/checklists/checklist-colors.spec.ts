import { contrastRatio, DEFAULT_LEVEL_COLORS, defaultLevelColor, highlightStyle, resolveResultColors, withResolvedLevelColors } from './checklist-colors.js';
import { createChecklistScaleSchema, updateChecklistScaleSchema } from './checklists.schemas.js';

describe('checklist highlight colours (PR 369б)', () => {
  it('derives the default level colour from the score share: best green, zero red, between orange', () => {
    const levels = withResolvedLevelColors([{ score: 0 }, { score: 5 }, { score: 10 }]);
    expect(levels.map((level) => level.color)).toEqual([DEFAULT_LEVEL_COLORS.zero, DEFAULT_LEVEL_COLORS.partial, DEFAULT_LEVEL_COLORS.full]);
    expect(defaultLevelColor(100, 100)).toBe(DEFAULT_LEVEL_COLORS.full);
  });

  it('keeps an owner-chosen colour over the default', () => {
    expect(withResolvedLevelColors([{ score: 0, color: '#123456' }, { score: 1, color: null }]).map((level) => level.color)).toEqual(['#123456', DEFAULT_LEVEL_COLORS.full]);
  });

  it('falls back to the default result colours per band', () => {
    expect(resolveResultColors(null)).toEqual({ low: '#C62828', mid: '#F9A825', high: '#2E7D32' });
    expect(resolveResultColors({ resultColorMid: '#000000' }).mid).toBe('#000000');
  });

  it('accepts a level colour only as #RRGGBB and stores it upper-case', () => {
    const levels = [{ value: 1, label: 'A', score: 0, color: '#ff00aa' }, { value: 2, label: 'B', score: 5 }];
    expect(createChecklistScaleSchema.parse({ name: 'S', levels }).levels[0]?.color).toBe('#FF00AA');
    for (const bad of ['red', '#fff', 'var(--x)', 'expression(alert(1))', '#gggggg', '"><script>']) {
      expect(updateChecklistScaleSchema.safeParse({ levels: [{ ...levels[0], color: bad }, levels[1]] }).success).toBe(false);
    }
  });

  it('limits a scale name to 255 characters', () => {
    const levels = [{ value: 1, label: 'A', score: 0 }, { value: 2, label: 'B', score: 5 }];
    expect(createChecklistScaleSchema.safeParse({ name: 'x'.repeat(255), levels }).success).toBe(true);
    expect(createChecklistScaleSchema.safeParse({ name: 'x'.repeat(256), levels }).success).toBe(false);
  });
});

describe('highlight style contrast (PR 370)', () => {
  const samples = ['#000000', '#FFFFFF', '#FFFF00', '#00FFFF', '#FF00FF', '#808080', '#767676', '#C62828', '#2E7D32', '#F9A825', '#E65100', '#0000FF', '#010101', '#FEFEFE'];
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    samples.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`);
  }

  it('keeps WCAG AA (4.5:1) between row fill and text in both themes for any chosen colour', () => {
    for (const color of samples) {
      const style = highlightStyle(color);
      expect(style.color).toBe(color);
      expect(contrastRatio(style.light.fill, style.light.text)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(style.dark.fill, style.dark.text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

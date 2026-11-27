import { describe, expect, it } from 'vitest';
import { assessmentAccentContrast, assessmentThemeSchema } from './assessment-presentation.js';

describe('assessment accent contrast', () => {
  it('uses the more readable foreground for dark and light accents', () => {
    expect(assessmentAccentContrast('#000000')).toEqual({ white: 21, foreground: '#fff' });
    expect(assessmentAccentContrast('#ffffff')).toEqual({ white: 1, foreground: '#000' });
  });

  it('detects colors on either side of the WCAG AA threshold', () => {
    expect(assessmentAccentContrast('#767676').white).toBeGreaterThan(4.5);
    expect(assessmentAccentContrast('#777777').white).toBeLessThan(4.5);
  });

  it('only accepts hex colors and supported fonts', () => {
    expect(assessmentThemeSchema.safeParse({ accent: 'red' }).success).toBe(false);
    expect(assessmentThemeSchema.safeParse({ headingFont: 'custom' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { rateColor, weekLabel } from './SheetAnalyticsDashboard.js';

describe('analytics dashboard helpers (PR 519)', () => {
  it('colours a rate green from 80, amber from 60 and red below; no data is neutral', () => {
    expect(rateColor(95)).toBe('var(--color-success)');
    expect(rateColor(80)).toBe('var(--color-success)');
    expect(rateColor(79)).toBe('var(--color-warning)');
    expect(rateColor(60)).toBe('var(--color-warning)');
    expect(rateColor(59)).toBe('var(--color-danger)');
    expect(rateColor(null)).toBe('var(--color-text-subtle)');
  });

  it('writes a week as day.month', () => {
    expect(weekLabel('2026-10-05')).toBe('05.10');
  });
});

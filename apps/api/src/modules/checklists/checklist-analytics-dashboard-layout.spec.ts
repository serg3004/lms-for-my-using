import { describe, expect, it } from '@jest/globals';

import { normalizeLayout } from './checklist-analytics-dashboard-layout.js';
import { checklistAnalyticsDashboardLayoutSchema, checklistAnalyticsSliceQuerySchema } from './checklists.schemas.js';

const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };

describe('analytics dashboards (PR 520)', () => {
  it('reads the first version (one list of widgets) as one default dashboard', () => {
    expect(normalizeLayout({ version: 1, widgets: [{ id: 'trend', size: 'L' }, { id: 'nope', size: 'S' }, { id: 'trend', size: 'S' }, { id: 'kpi', size: 'XL' }] }))
      .toEqual({ version: 2, current: 'main', dashboards: [{ id: 'main', name: '', widgets: [{ id: 'trend', size: 'L' }, { id: 'kpi', size: 'M' }] }] });
  });

  it('keeps named dashboards with the card options, drops broken ones and repairs the current one', () => {
    const set = normalizeLayout({
      version: 2, current: 'gone',
      dashboards: [
        { id: 'boss', name: '  Руководителю ', widgets: [{ id: 'people', size: 'S', options: { metric: 'sessions', limit: '10', junk: 7 } }] },
        { id: 'Bad Id', name: 'x', widgets: [] }, { id: 'boss', name: 'again', widgets: [] },
        { id: 'report', name: 'Для отчёта', widgets: [] },
      ],
    });
    expect(set?.current).toBe('boss');
    expect(set?.dashboards).toEqual([
      { id: 'boss', name: 'Руководителю', widgets: [{ id: 'people', size: 'S', options: { metric: 'sessions', limit: '10' } }] },
      { id: 'report', name: 'Для отчёта', widgets: [] },
    ]);
  });

  it('treats a missing or broken value as nothing saved, but an empty dashboard as a real one', () => {
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout({ dashboards: 'x' })).toBeNull();
    expect(normalizeLayout({ dashboards: [] })).toBeNull();
    expect(normalizeLayout({ version: 1, widgets: [] })?.dashboards[0]?.widgets).toEqual([]);
  });

  it('accepts dashboards, null (reset) and rejects repeats, unknown widgets, unknown current and too many', () => {
    const board = (id: string) => ({ id, name: 'A', widgets: [{ id: 'donut' as const, size: 'S' as const, options: { by: 'plan' } }] });
    expect(checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [board('a')] }).scope).toBe('user');
    expect(checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: null, scope: 'organization' }).dashboards).toBeNull();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [board('a'), board('a')] })).toThrow();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [board('a')], current: 'b' })).toThrow();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [] })).toThrow();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: Array.from({ length: 11 }, (_, index) => board(`d${index}`)) })).toThrow();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [{ id: 'a', name: '', widgets: [{ id: 'nonsense', size: 'S' }] }] })).toThrow();
    expect(checklistAnalyticsDashboardLayoutSchema.parse({ dashboards: [{ id: 'a', name: '', widgets: [{ id: 'map', size: 'L', options: { view: 'density' } }] }] }).dashboards).toHaveLength(1);
  });

  it('needs a result band or a weekday with a block to open a slice', () => {
    expect(checklistAnalyticsSliceQuerySchema.parse({ ...range, result: 'good' }).result).toBe('good');
    expect(checklistAnalyticsSliceQuerySchema.parse({ ...range, weekday: '2', block: '4' })).toMatchObject({ weekday: 2, block: 4 });
    expect(() => checklistAnalyticsSliceQuerySchema.parse(range)).toThrow();
    expect(() => checklistAnalyticsSliceQuerySchema.parse({ ...range, weekday: '2' })).toThrow();
    expect(() => checklistAnalyticsSliceQuerySchema.parse({ ...range, weekday: '7', block: '0' })).toThrow();
  });
});

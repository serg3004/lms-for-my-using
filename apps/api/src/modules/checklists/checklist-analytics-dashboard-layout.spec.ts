import { describe, expect, it } from '@jest/globals';

import { normalizeLayout } from './checklist-analytics-dashboard-layout.js';
import { checklistAnalyticsDashboardLayoutSchema } from './checklists.schemas.js';

describe('analytics dashboard layout (PR 520)', () => {
  it('keeps known widgets once, in order, and defaults a bad size to medium', () => {
    expect(normalizeLayout({ version: 1, widgets: [{ id: 'trend', size: 'L' }, { id: 'nope', size: 'S' }, { id: 'trend', size: 'S' }, { id: 'kpi', size: 'XL' }] }))
      .toEqual({ version: 1, widgets: [{ id: 'trend', size: 'L' }, { id: 'kpi', size: 'M' }] });
  });

  it('treats a missing or broken value as no layout, but an empty list as an empty dashboard', () => {
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout({ widgets: 'x' })).toBeNull();
    expect(normalizeLayout({ version: 1, widgets: [] })).toEqual({ version: 1, widgets: [] });
  });

  it('accepts a list, null (reset) and rejects repeats and unknown widgets', () => {
    expect(checklistAnalyticsDashboardLayoutSchema.parse({ widgets: [{ id: 'donut', size: 'S' }] }).scope).toBe('user');
    expect(checklistAnalyticsDashboardLayoutSchema.parse({ widgets: null, scope: 'organization' }).widgets).toBeNull();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ widgets: [{ id: 'donut', size: 'S' }, { id: 'donut', size: 'M' }] })).toThrow();
    expect(() => checklistAnalyticsDashboardLayoutSchema.parse({ widgets: [{ id: 'map', size: 'S' }] })).toThrow();
  });
});

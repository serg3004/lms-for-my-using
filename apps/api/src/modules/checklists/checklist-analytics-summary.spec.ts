import { describe, expect, it } from '@jest/globals';

import { answerPercentage, buildAnalyticsSummary, weekStart, type SummaryInstance } from './checklist-analytics-summary.js';

const yesNo = (overrides: Partial<SummaryInstance> & { checked?: boolean; itemText?: string }): SummaryInstance => ({
  checklistId: 'sheet-1', sessionStatus: 'completed', instanceStatus: 'completed', percentage: 80, scored: true, at: new Date('2026-11-04T10:00:00Z'),
  departmentId: 'd1', departmentName: 'Склад',
  snapshot: { checklist: { scoringMode: 'sum_points', items: [{ id: 'i1', text: overrides.itemText ?? 'Каски надеты', points: 10 }] } },
  results: [{ itemId: 'i1', answerState: 'answered', scaleLevel: null, checked: overrides.checked ?? true, points: 10 }],
  ...overrides,
});

describe('analytics summary (PR 519)', () => {
  it('starts a week on Monday', () => {
    expect(weekStart(new Date('2026-11-04T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(weekStart(new Date('2026-11-08T23:59:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('groups the trend by week with completion counts and the average score', () => {
    const { trend } = buildAnalyticsSummary([
      yesNo({ percentage: 80 }), yesNo({ percentage: 60 }), yesNo({ sessionStatus: 'scheduled', instanceStatus: 'pending' }),
      yesNo({ at: new Date('2026-11-12T10:00:00Z'), percentage: 100 }),
    ]);
    expect(trend).toEqual([
      { weekStart: '2026-11-02', planned: 3, completed: 2, averagePercentage: 70 },
      { weekStart: '2026-11-09', planned: 1, completed: 1, averagePercentage: 100 },
    ]);
  });

  it('keeps cancelled sessions out of every block', () => {
    const summary = buildAnalyticsSummary([yesNo({ sessionStatus: 'cancelled' })]);
    expect(summary).toEqual({ trend: [], departments: [], weak: [] });
  });

  it('ranks departments by completion, then by score, and names the ones without a department as null', () => {
    const { departments } = buildAnalyticsSummary([
      yesNo({ departmentId: 'd1', departmentName: 'Склад' }), yesNo({ departmentId: 'd1', departmentName: 'Склад', sessionStatus: 'scheduled', instanceStatus: 'pending' }),
      yesNo({ departmentId: 'd2', departmentName: 'Касса' }),
      yesNo({ departmentId: null, departmentName: null, percentage: 90 }),
    ]);
    expect(departments.map((row) => [row.name, row.completionPercentage, row.averagePercentage])).toEqual([['Касса', 100, 80], [null, 100, 90], ['Склад', 50, 80]].sort((a, b) => (b[1] as number) - (a[1] as number) || (b[2] as number) - (a[2] as number)));
  });

  it('lists the weakest criteria with at least three answers, lowest first', () => {
    const rows = [
      ...[false, false, true].map((checked) => yesNo({ checked, itemText: 'Каски надеты' })),
      ...[true, true, true].map((checked) => yesNo({ checked, itemText: 'Каски надеты' })),
    ];
    const { weak } = buildAnalyticsSummary(rows);
    expect(weak).toEqual([{ id: 'i1', checklistId: 'sheet-1', text: 'Каски надеты', answered: 6, percentage: 67 }]);
    expect(buildAnalyticsSummary(rows.slice(0, 2)).weak).toEqual([]);
  });

  it('scores a scale answer against the best level and ignores unscored sheets', () => {
    const item = { id: 'i1', scale: { id: 's', levels: [{ value: 1, score: 0 }, { value: 2, score: 5 }, { value: 3, score: 10 }] } };
    const result = { itemId: 'i1', answerState: 'answered', scaleLevel: 2, checked: false, points: 5 };
    expect(answerPercentage(item, 'sum_points', result)).toBe(50);
    expect(answerPercentage(item, 'none', result)).toBeNull();
    expect(answerPercentage({ id: 'i1' }, 'sum_points', { ...result, checked: true })).toBe(100);
  });
});

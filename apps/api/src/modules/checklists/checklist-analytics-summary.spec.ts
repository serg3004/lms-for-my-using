import { describe, expect, it } from '@jest/globals';

import { answerPercentage, buildAnalyticsSummary, buildHeat, resultBand, weekStart, type SummaryInstance } from './checklist-analytics-summary.js';

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
    expect(summary).toMatchObject({ trend: [], departments: [], weak: [], results: { good: 0, mid: 0, bad: 0 }, people: [] });
    expect(summary.heat.flat().every((count) => count === 0)).toBe(true);
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

  it('splits finished scored results into the three bands at 80 and 60', () => {
    expect(resultBand(80)).toBe('good');
    expect(resultBand(79)).toBe('mid');
    expect(resultBand(60)).toBe('mid');
    expect(resultBand(59)).toBe('bad');
    const { results } = buildAnalyticsSummary([yesNo({ percentage: 95 }), yesNo({ percentage: 70 }), yesNo({ percentage: 10 }), yesNo({ scored: false }), yesNo({ sessionStatus: 'scheduled', instanceStatus: 'pending' })]);
    expect(results).toEqual({ good: 1, mid: 1, bad: 1 });
  });

  it('draws the heat map by weekday and two-hour block in the viewer\'s time', () => {
    // Wednesday 2026-11-04 22:30 UTC is Thursday 03:30 at +05:00.
    const late = yesNo({ completedAt: new Date('2026-11-04T22:30:00Z') });
    expect(buildHeat([late])[2]![11]).toBe(1);
    expect(buildHeat([late], 300)[3]![1]).toBe(1);
    expect(buildHeat([yesNo({ sessionStatus: 'scheduled', instanceStatus: 'pending' })]).flat().reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('ranks employees by their average, leaves guests out and keeps the best 50', () => {
    const rows = [
      yesNo({ userId: 'u1', userName: 'Иванов Анна', percentage: 90 }), yesNo({ userId: 'u1', userName: 'Иванов Анна', percentage: 70 }),
      yesNo({ userId: 'u2', userName: 'Ахметов Нурлан', percentage: 95 }),
      yesNo({ userId: 'g', userName: 'Guest', percentage: 100, guest: true }),
      ...['a', 'b', 'c', 'd'].map((id, index) => yesNo({ userId: id, userName: id, percentage: 50 + index })),
    ];
    const { people } = buildAnalyticsSummary(rows);
    expect(people).toHaveLength(6);
    expect(people.slice(0, 2)).toEqual([
      { id: 'u2', name: 'Ахметов Нурлан', sessions: 1, averagePercentage: 95 },
      { id: 'u1', name: 'Иванов Анна', sessions: 2, averagePercentage: 80 },
    ]);
    expect(people.some((person) => person.id === 'g')).toBe(false);
  });
});

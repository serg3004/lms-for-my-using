import { describe, expect, it } from 'vitest';

import type { ItemAnalyticsCriterion } from '../shared/api/manager.js';
import { arrangeRows, mergeScales, parsePicked, sumRows, togglePicked } from './SheetItemAnalytics.js';

const scale = (no: number, yes: number) => ({ scaleKey: 'yes_no', kind: 'yes_no' as const, name: null, levels: [{ value: 0, label: null, labelKey: 'no' as const, color: null, count: no }, { value: 1, label: null, labelKey: 'yes' as const, color: null, count: yes }] });
const row = (id: string, text: string, total: number, answered: number, skipped: number, scoreSum: number, scoreMax: number, no: number, yes: number): ItemAnalyticsCriterion => ({
  id, text, groupId: null, total, answered, skipped, remaining: total - answered - skipped,
  completionPercentage: total ? Math.round((answered / total) * 100) : null, averagePercentage: scoreMax ? Math.round((scoreSum / scoreMax) * 100) : null,
  scoreSum, scoreMax, withNote: 0, noteShare: null, scales: [scale(no, yes)],
});
const rows = [row('a', 'Каски', 4, 4, 0, 4, 4, 0, 4), row('b', 'Проход', 4, 3, 1, 2, 3, 1, 2), row('c', 'Огнетушитель', 4, 2, 0, 1, 2, 1, 1), row('d', 'Без ответов', 0, 0, 0, 0, 0, 0, 0)];

describe('picked criteria of the address bar (PR 462)', () => {
  it('parses the list, drops blanks and duplicates', () => {
    expect(parsePicked(null)).toEqual([]);
    expect(parsePicked('a, b,,a')).toEqual(['a', 'b']);
  });
  it('toggles a row and stores "every row" as an empty list', () => {
    expect(togglePicked([], 'a', ['a', 'b', 'c'])).toEqual(['b', 'c']);
    expect(togglePicked(['b', 'c'], 'a', ['a', 'b', 'c'])).toEqual([]);
    expect(togglePicked(['b', 'c'], 'b', ['a', 'b', 'c'])).toEqual(['c']);
  });
});

describe('arrangeRows (PR 462)', () => {
  it('searches the text case-insensitively', () => {
    expect(arrangeRows(rows, ' ОГНЕТУШ ', 'order').map((entry) => entry.id)).toEqual(['c']);
  });
  it('sorts by completion or average, lowest first, with rows without a value last', () => {
    expect(arrangeRows(rows, '', 'completion').map((entry) => entry.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(arrangeRows(rows, '', 'average').map((entry) => entry.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(arrangeRows(rows, '', 'order').map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('sumRows and mergeScales (PR 462)', () => {
  it('recomputes the total from the raw sums, not from rounded percentages', () => {
    const total = sumRows(rows.slice(0, 3));
    expect(total).toMatchObject({ total: 12, answered: 9, skipped: 1, remaining: 2, completionPercentage: 75, scoreSum: 7, scoreMax: 9, averagePercentage: 78 });
    expect(sumRows([rows[2]!])).toMatchObject({ completionPercentage: 50, averagePercentage: 50 });
  });
  it('gives null percentages for an empty set', () => {
    expect(sumRows([])).toMatchObject({ total: 0, completionPercentage: null, averagePercentage: null, noteShare: null });
  });
  it('adds up the level counts of the same scale', () => {
    const [merged] = mergeScales(rows.slice(0, 3));
    expect(merged!.levels.map((level) => [level.value, level.count])).toEqual([[0, 2], [1, 7]]);
  });
});

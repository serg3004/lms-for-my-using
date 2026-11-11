import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

import { arrangeItemRows, ChecklistAnalyticsExport, feedbackExportRows, itemsExportRows, levelRows, mergeScales, notesExportRows, sheetsExportRows, sumItemRows } from './checklist-analytics-export.js';
import { checklistAnalyticsExportQuerySchema } from './checklists.schemas.js';

type Rec = Record<string, unknown>;
const yesNo = (no: number, yes: number) => ({ scaleKey: 'yes_no', kind: 'yes_no' as const, name: null, levels: [{ value: 0, label: null, labelKey: 'no' as const, count: no }, { value: 1, label: null, labelKey: 'yes' as const, count: yes }] });
const metric = (id: string, text: string, total: number, answered: number, skipped: number, scoreSum: number, scoreMax: number, withNote: number, no: number, yes: number, extra: Rec = {}) => ({
  id, text, groupId: null, total, answered, skipped, remaining: total - answered - skipped,
  completionPercentage: Math.round((answered / total) * 100), averagePercentage: scoreMax ? Math.round((scoreSum / scoreMax) * 100) : null,
  scoreSum, scoreMax, withNote, noteShare: answered ? Math.round((withNote / answered) * 100) : null, scales: [yesNo(no, yes)], ...extra,
});
const noText = (row: Rec) => { const copy = { ...row }; delete copy.text; return copy; };
const criteria = [
  metric('c1', 'Каски надеты', 4, 4, 0, 4, 4, 1, 0, 4, { groupId: 'g1' }),
  metric('c2', 'Проход свободен', 4, 3, 1, 2, 3, 1, 1, 2, { groupId: 'g1' }),
  metric('c3', 'Огнетушитель на месте', 4, 2, 0, 1, 2, 0, 1, 1),
];

describe('arrangeItemRows (PR 463)', () => {
  it('keeps the picked rows, searches the text and sorts like the screen', () => {
    expect(arrangeItemRows(criteria, { pick: ['c2', 'c3'] }).map((row) => row.id)).toEqual(['c2', 'c3']);
    expect(arrangeItemRows(criteria, { q: ' ОГНЕТУШ ' }).map((row) => row.id)).toEqual(['c3']);
    expect(arrangeItemRows(criteria, { sort: 'completion' }).map((row) => row.id)).toEqual(['c3', 'c2', 'c1']);
    expect(arrangeItemRows(criteria, { pick: [] }).map((row) => row.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('sumItemRows and mergeScales (PR 463)', () => {
  it('totals from the raw sums, like the screen', () => {
    expect(sumItemRows(criteria)).toMatchObject({ total: 12, answered: 9, skipped: 1, remaining: 2, completionPercentage: 75, averagePercentage: 78 });
    expect(sumItemRows([criteria[2]!])).toMatchObject({ completionPercentage: 50, averagePercentage: 50 });
    expect(mergeScales(criteria)[0]!.levels.map((level) => level.count)).toEqual([2, 7]);
  });
});

describe('export tables (PR 463)', () => {
  it('writes criteria with the group, a total row and the level block, in the viewer language', () => {
    const rows = itemsExportRows('criteria', criteria, new Map([['g1', 'Каски и проходы']]), 'ru');
    expect(rows[0]![0]).toBe('Критерий');
    expect(rows[1]).toEqual(['Каски надеты', 'Каски и проходы', 100, 100, 4, 4, 0, 0, 1, 25]);
    expect(rows[4]).toEqual(['Итого', '', 75, 78, 9, 12, 2, 1, 2, 22]);
    expect(rows.slice(5)).toEqual([[], ['Шкала', 'Уровень', 'Ответов', 'Доля, %'], ['Критерии «Да / Нет»', 'Нет', 2, 22], ['Критерии «Да / Нет»', 'Да', 7, 78]]);
    expect(itemsExportRows('criteria', criteria, new Map(), 'en')[0]![0]).toBe('Criterion');
  });
  it('writes groups with the "without a group" row', () => {
    const group = { ...noText(metric('g1', '', 8, 7, 1, 6, 7, 2, 1, 6)), id: 'g1', title: 'Каски и проходы', criteriaCount: 2 };
    const none = { ...noText(metric('x', '', 4, 2, 0, 1, 2, 0, 1, 1)), id: null, title: null, criteriaCount: 1 };
    const rows = itemsExportRows('groups', [group, none] as never, new Map(), 'ru');
    expect(rows[1]![0]).toBe('Каски и проходы');
    expect(rows[2]![0]).toBe('Без группы');
  });
  it('writes the sheets table, a total row and the levels of the total', () => {
    const base = { plan: { planned: 4, completed: 3, overdue: 1 }, completionPercentage: 75, averagePercentage: 81, criteria: { total: 12, answered: 8, skipped: 1, remaining: 3 }, queue: { notStarted: 1 }, scales: [yesNo(2, 6)] };
    const rows = sheetsExportRows({ total: base, sheets: [{ ...base, checklistId: 'a', title: 'Охрана труда' }] }, 'en');
    expect(rows[0]![0]).toBe('Checklist');
    expect(rows[1]).toEqual(['Охрана труда', 4, 3, 1, 75, 81, 8, 12, 1]);
    expect(rows[2]![0]).toBe('Total');
    expect(rows.at(-1)).toEqual(['Yes / No criteria', 'Yes', 6, 75]);
  });
  it('writes feedback per option and notes with dates', () => {
    const fields = [
      { id: 'mood', kind: 'choice' as const, title: 'Настроение', builtin: null, sessions: 4, filled: 3, notFilled: 1, options: [{ id: 'good', name: 'Хорошее', count: 2 }] },
      { id: 'strengths', kind: 'text' as const, title: '', builtin: 'strengths', sessions: 4, filled: 2, notFilled: 2, options: [] },
    ];
    expect(feedbackExportRows(fields, 'ru')).toEqual([
      ['Поле', 'Тип', 'Сессий', 'Заполнено', 'Не заполнено', 'Вариант', 'Ответов'],
      ['Настроение', 'Выбор', 4, 3, 1, 'Хорошее', 2],
      ['Сильные стороны', 'Текст', 4, 2, 2, '', ''],
    ]);
    expect(notesExportRows([{ itemText: 'Каски', comment: 'Без ремня', reviewComment: null, at: '2026-10-20T09:00:00.000Z', employee: 'Иванов Иван', observer: null }], 'en')[1]).toEqual(['2026-10-20', 'Каски', 'Без ремня', '', 'Иванов Иван', '']);
  });
  it('has no level block for a table without scales', () => {
    expect(levelRows([], 'ru')).toEqual([]);
  });
});

describe('checklistAnalyticsExportQuerySchema (PR 463)', () => {
  const base = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };
  const sheet = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  it('needs a sheet for the cuts of one sheet, not for the overview', () => {
    expect(checklistAnalyticsExportQuerySchema.safeParse({ ...base, view: 'criteria' }).success).toBe(false);
    expect(checklistAnalyticsExportQuerySchema.safeParse({ ...base, view: 'sheets' }).success).toBe(true);
    expect(checklistAnalyticsExportQuerySchema.parse({ ...base, view: 'criteria', checklistId: sheet.toUpperCase(), pick: 'c1, c2,,', sort: 'average', format: 'xlsx' })).toMatchObject({ checklistId: sheet, pick: ['c1', 'c2'], sort: 'average', format: 'xlsx' });
    expect(checklistAnalyticsExportQuerySchema.parse({ ...base, view: 'sheets' }).format).toBe('csv');
    expect(checklistAnalyticsExportQuerySchema.safeParse({ ...base, view: 'tables' }).success).toBe(false);
  });
});

describe('ChecklistAnalyticsExport (PR 463)', () => {
  const actor = { id: 'u1', roles: ['instructor'], locale: 'ru' };
  const overview = { total: { plan: { planned: 1, completed: 1, overdue: 0 }, completionPercentage: 100, averagePercentage: 90, criteria: { total: 2, answered: 2, skipped: 0, remaining: 0 }, queue: { notStarted: 0 }, scales: [] }, sheets: [{ checklistId: 'a', title: 'Лист', plan: { planned: 1, completed: 1, overdue: 0 }, completionPercentage: 100, averagePercentage: 90, criteria: { total: 2, answered: 2, skipped: 0, remaining: 0 }, queue: { notStarted: 0 }, scales: [] }] };
  const harness = () => {
    const sheets = { overview: jest.fn(async () => overview) };
    const items = { items: jest.fn(async (...args: unknown[]) => { const query = args[4] as Rec; return query.by === 'notes' ? { notes: { items: [{ itemText: 'Каски', comment: 'Без ремня', reviewComment: null, at: '2026-10-20T09:00:00.000Z', employee: 'Иванов Иван', observer: null }] } } : query.by === 'groups' ? { groups: [{ ...noText(metric('g1', '', 8, 7, 1, 6, 7, 2, 1, 6)), id: 'g1', title: 'Группа', criteriaCount: 2 }] } : { criteria }; }) };
    const audit = { record: jest.fn(async () => undefined) };
    return { sheets, items, audit, exporter: new ChecklistAnalyticsExport(sheets as never, items as never, audit as never) };
  };
  const q = (extra: Rec) => checklistAnalyticsExportQuerySchema.parse({ from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', ...extra });
  const sheet = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('reads the overview through the access-checked operation and logs counts only', async () => {
    const { exporter, sheets, audit } = harness();
    const out = await exporter.export('org', actor, { scope: true }, q({ view: 'sheets', checklistIds: sheet }));
    expect(sheets.overview).toHaveBeenCalledWith('org', actor, { scope: true }, expect.objectContaining({ checklistIds: [sheet] }));
    expect(out.rowCount).toBe(1);
    expect(out.csv.startsWith('﻿"Чек-лист"')).toBe(true);
    const entry = (audit.record.mock.calls[0] as unknown[])[0] as { action: string; metadata: { kind: string; rowCount: number }; summary: string };
    expect(entry).toMatchObject({ action: 'checklist_report.exported', metadata: { kind: 'analytics_sheets', rowCount: 1 } });
    expect(JSON.stringify(entry)).not.toContain('Лист');
  });
  it('exports the picked criteria of one sheet with the group names', async () => {
    const { exporter, items } = harness();
    const out = await exporter.export('org', actor, {}, q({ view: 'criteria', checklistId: sheet, pick: 'c2' }));
    expect(items.items).toHaveBeenCalled();
    expect(out.rows[1]![0]).toBe('Проход свободен');
    expect(out.rows[1]![1]).toBe('Группа');
    expect(out.rowCount).toBe(1);
  });
  it('asks for the whole notes list, not one page', async () => {
    const { exporter, items } = harness();
    await exporter.export('org', actor, {}, q({ view: 'notes', checklistId: sheet, itemId: 'c1' }));
    expect(items.items).toHaveBeenCalledWith('org', actor, {}, sheet, expect.objectContaining({ by: 'notes', itemId: 'c1' }), { allNotes: true });
  });
  it('refuses an export over the row limit', async () => {
    const { exporter, sheets } = harness();
    sheets.overview.mockResolvedValueOnce({ ...overview, sheets: Array.from({ length: 5001 }, () => overview.sheets[0]!) });
    await expect(exporter.export('org', actor, {}, q({ view: 'sheets' }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

import { readFileSync } from 'node:fs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { buildSessionSummary, SUMMARY_LABELS } from './checklist-session-summary.js';
import { buildSessionReport, type ChecklistSessionReport } from './checklist-session-report.js';
import { serializeReportCsv } from './checklist-report-csv.js';
import { checklistSessionSummaryQuerySchema } from './checklists.schemas.js';

const fixture = JSON.parse(readFileSync(new URL('../../../../../tests/fixtures/checklist-session-summary-5s.json', import.meta.url), 'utf8'));
function report(): ChecklistSessionReport {
  const result = structuredClone(fixture.report);
  for (const key of ['scheduledStart', 'scheduledEnd', 'startedAt', 'completedAt']) result.header[key] = new Date(result.header[key]);
  return result;
}
const cell = (rows: (string | number)[][], address: string) => {
  const [, column, number] = /^([A-Z])(\d+)$/.exec(address)!;
  return rows[Number(number) - 1]![column!.charCodeAt(0) - 65];
};

describe('session summary table (PR 373)', () => {
  it('matches the anonymized 5S golden cells, row order, headers and merge locations', () => {
    const table = buildSessionSummary([report()], 'ru');
    expect({ rows: table.rows, layout: table.layout }).toEqual(fixture.exportTable);
    for (const [address, value] of Object.entries(fixture.expectedCells)) expect(cell(table.rows, address)).toEqual(value);
    expect(table.rows).toHaveLength(51);
    expect(table.layout).toMatchObject({ sheetName: 'Worksheet 1', freezeRows: 9, columnWidths: [45, 16, 16, 16], headerRows: [2, 9, 10, 16, 18, 19, 21, 48] });
    expect(table.layout.merges).toContainEqual({ startRow: 9, startColumn: 2, endRow: 9, endColumn: 3 });
  });
  it('sorts three observations by actual date and aggregates server scores, rather than averaging rounded percentages', () => {
    const reports = [report(), report(), report()];
    reports.forEach((item, index) => { item.sessionId = `s${index}`; item.header.startedAt = new Date(`2026-10-0${3-index}T10:00:00Z`); });
    const table = buildSessionSummary(reports, 'en');
    expect(table.sessionIds).toEqual(['s2', 's1', 's0']);
    expect(table.rows[8]![1]).toBe('90% · 213 of 237');
    expect(table.rows[8]!.slice(3).map(String)).toEqual([expect.stringContaining('Observation 1'), expect.stringContaining('Observation 2'), expect.stringContaining('Observation 3')]);
  });
  it('keeps employees, changed criterion text and different calculation formulas in separate blocks', () => {
    const first = report(), other = report(), changed = report(), formula = report();
    other.sessionId = 'other'; other.header.learner.id = 'other'; other.header.learner.firstName = 'Other';
    changed.sessionId = 'changed'; changed.criteria[0]!.text = 'Changed prompt';
    if (formula.visible) formula.summary.formula = 'criteria';
    formula.sessionId = 'formula';
    const table = buildSessionSummary([first, other, changed, formula], 'en');
    expect(table.rows.filter((row) => row[0] === 'Overall score')).toHaveLength(4);
    expect(table.rows.filter((row) => row[0] === 'Overall score').every((row) => row[1] === '90% · 71 of 79')).toBe(true);
  });
  it('preserves the authoritative percentage of one observation and never turns an unscored result into zero percent', () => {
    const value = report();
    if (!value.visible) throw new Error('fixture');
    value.summary.percentage = 89;
    expect(buildSessionSummary([value], 'en').rows[8]![1]).toBe('89% · 71 of 79');
    value.summary.scored = false; value.summary.percentage = null;
    expect(buildSessionSummary([value], 'en').rows[8]![1]).toBe('Not scored · 0 of 0');
    value.criteria[0]!.state = 'skipped'; value.criteria[0]!.score = null; value.criteria[0]!.maxScore = null;
    expect(buildSessionSummary([value], 'en').rows[19]![3]).toBe('Skipped\nВыполнено');
  });
  it.each(['ru', 'en', 'kk', 'zh'] as const)('localizes headings in %s without losing Unicode or CSV protection', (locale) => {
    const value = report();
    value.header.learner.firstName = '=HYPERLINK("bad")';
    const result = buildSessionSummary([value], locale);
    expect(result.rows[1]![0]).toBe(SUMMARY_LABELS[locale].title);
    expect(serializeReportCsv(result.rows)).toContain(`"'=HYPERLINK(""bad"")`);
  });
  it('bounds observations and rows, rejects hidden/incomplete reports and mixed sheets', () => {
    expect(() => buildSessionSummary([], 'en')).toThrow(BadRequestException);
    expect(() => buildSessionSummary(Array.from({ length: 51 }, report), 'en')).toThrow(BadRequestException);
    expect(() => buildSessionSummary([{ ...report(), visible: false } as ReturnType<typeof buildSessionReport>], 'en')).toThrow(ForbiddenException);
    const incomplete = report(); incomplete.header.status = 'scheduled';
    expect(() => buildSessionSummary([incomplete], 'en')).toThrow('session_summary.completed_only');
    const mixed = report(); mixed.checklist.id = 'different';
    expect(() => buildSessionSummary([report(), mixed], 'en')).toThrow('session_summary.one_checklist');
    const huge = report(); huge.criteria = Array.from({ length: 5001 }, () => huge.criteria[0]!);
    expect(() => buildSessionSummary([huge], 'en')).toThrow('session_summary.row_limit');
  });
  it('validates UUID selections, duplicates, limits and formats before querying data', () => {
    expect(checklistSessionSummaryQuerySchema.parse({ ids: fixture.report.sessionId }).format).toBe('xlsx');
    for (const query of [{ ids: '' }, { ids: 'bad' }, { ids: `${fixture.report.sessionId},${fixture.report.sessionId}` }, { ids: fixture.report.sessionId, format: 'html' }, { ids: Array(51).fill(fixture.report.sessionId).join(',') }]) {
      expect(checklistSessionSummaryQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

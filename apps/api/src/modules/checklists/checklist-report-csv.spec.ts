import { employeeExportRows, exportLocale, neutralizeCsvCell, serializeReportCsv, sessionExportRows, viewEmployees } from './checklist-report-csv.js';

const row = (overrides: Partial<Parameters<typeof viewEmployees>[0][number]> = {}) => ({
  firstName: 'Alex', lastName: 'Kim', email: 'alex@example.test', department: 'Warehouse',
  sessionsCount: 3, completedCount: 3, averagePercentage: 85, trend: 'up' as const, ...overrides,
});

describe('report CSV (PR 336)', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises the formula prefix of %j', (value) => {
    expect(neutralizeCsvCell(value)).toBe(`'${value}`);
  });

  it('leaves ordinary text and numbers untouched', () => {
    expect(neutralizeCsvCell('Opening shift')).toBe('Opening shift');
    expect(neutralizeCsvCell('85')).toBe('85');
  });

  it('quotes every cell, doubles quotes, keeps commas/newlines inside cells and starts with a BOM', () => {
    const csv = serializeReportCsv([['a"b', 'c,d'], ['line1\nline2', '=cmd']]);
    expect(csv).toBe('﻿"a""b","c,d"\r\n"line1\nline2","\'=cmd"\r\n');
  });

  it('exports honest empty cells instead of null/undefined for employees without data', () => {
    const rows = employeeExportRows([row({ department: null, averagePercentage: null, trend: null, sessionsCount: 0, completedCount: 0 })], 'en');
    expect(rows[1]).toEqual(['Alex Kim', '', 0, '', '']);
    expect(serializeReportCsv(rows)).not.toMatch(/null|undefined/);
  });

  it('does not export e-mail addresses of employees', () => {
    expect(serializeReportCsv(employeeExportRows([row()], 'ru'))).not.toContain('alex@example.test');
  });

  it('applies search, the no-completion toggle and sort like the dashboard', () => {
    const rows = [row(), row({ firstName: 'Mira', lastName: 'Lee', email: 'mira@example.test', department: null, completedCount: 0, averagePercentage: null })];
    expect(viewEmployees(rows, { q: 'MIRA' }).map((r) => r.firstName)).toEqual(['Mira']);
    expect(viewEmployees(rows, { noCompletion: 'true' }).map((r) => r.firstName)).toEqual(['Mira']);
    expect(viewEmployees(rows, { sort: 'average', dir: 'desc' }).map((r) => r.firstName)).toEqual(['Alex', 'Mira']);
    expect(viewEmployees(rows, { sort: 'employee', dir: 'desc' }).map((r) => r.firstName)).toEqual(['Mira', 'Alex']);
  });

  it('exports sessions without feedback or geolocation columns and hides masked results', () => {
    const base = {
      status: 'completed', scheduledAt: '2026-02-10T09:00:00.000Z', timezone: 'Asia/Almaty', durationMinutes: null,
      checklist: { title: '=HYPERLINK("x")' }, learner: { firstName: 'Leo', lastName: 'Learner' }, observer: { firstName: 'Olga', lastName: 'Observer' },
    };
    const rows = sessionExportRows([
      { ...base, result: { visible: true, scored: true, percentage: 80 } },
      { ...base, result: { visible: false, scored: null, percentage: null } },
      { ...base, result: { visible: true, scored: false, percentage: 0 } },
    ], 'en');
    expect(rows[0]).toHaveLength(8);
    expect(rows.slice(1).map((r) => r[7])).toEqual([80, '', '']);
    expect(rows[1]![4]).toBe('2026-02-10T09:00:00.000Z');
    expect(serializeReportCsv(rows)).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('falls back to English for unknown locales', () => {
    expect(exportLocale('ru-RU')).toBe('ru');
    expect(exportLocale('fr')).toBe('en');
    expect(exportLocale(null)).toBe('en');
  });
});

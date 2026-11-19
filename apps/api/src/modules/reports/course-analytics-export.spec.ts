import { serializeReportCsv } from '../checklists/public.js';
import { courseExportRows, coursesExportRows, formatDateTime, formatHoursMinutes, SHEET_NAMES, userExportRows } from './course-analytics-export.js';

const row = {
  status: 'completed' as const, lessonsTotal: 4, lessonsCompleted: 4, lessonsPercent: 100, testPercent: 90, testScore: 9, attempts: 2, testResult: 'passed' as const,
  startedAt: '2026-11-01T10:00:00.000Z', completedAt: '2026-11-04T10:30:00.000Z', durationMinutes: 4350, dueAt: '2026-11-10T00:00:00.000Z', overdue: false,
  certificate: { status: 'issued' as const },
};

describe('course analytics export rows (PR 475)', () => {
  it('formats minutes as hh:mm, also past 24 hours, and dates in the time zone of the user', () => {
    expect(formatHoursMinutes(null)).toBe('');
    expect(formatHoursMinutes(65)).toBe('01:05');
    expect(formatHoursMinutes(4350)).toBe('72:30');
    expect(formatDateTime('2026-11-04T22:30:00.000Z', 'Asia/Almaty')).toBe('2026-11-05 03:30');
    expect(formatDateTime('2026-11-04T22:30:00.000Z', 'No/Such_Zone')).toBe('2026-11-04 22:30');
    expect(formatDateTime(null, 'UTC')).toBe('');
  });

  it('builds the course summary table with a header, the data and the note on how time is counted', () => {
    const table = coursesExportRows([{ title: 'Охрана труда', assigned: 10, started: 8, completed: 6, completedPercent: 60, passed: 5, failed: 1, overdue: 2, avgPercent: 82, medianPercent: null, avgDurationMinutes: 90 }], 'ru');
    expect(table[0]).toHaveLength(11);
    expect(table[1]).toEqual(['Охрана труда', 10, 8, 6, 60, 5, 1, 2, 82, '', '01:30']);
    expect(String(table.at(-1)?.[0])).toContain('календарное');
  });

  it('builds the course report: employee, test result as words, time, dates and overdue', () => {
    const table = courseExportRows([{ ...row, user: { firstName: 'Анна', lastName: 'Иванова', email: 'a@x.kz' } }], 'ru', 'Asia/Almaty');
    expect(table[0]?.slice(0, 3)).toEqual(['Сотрудник', 'Email', 'Статус']);
    expect(table[1]).toEqual(['Иванова Анна', 'a@x.kz', 'Завершён', 4, 4, 100, 'Сдал', 90, 9, 2, '2026-11-01 15:00', '2026-11-04 15:30', '72:30', '2026-11-10 05:00', 'Нет', 'Выдан']);
  });

  it('builds the user report with the course title first and the failed result and overdue marked', () => {
    const table = userExportRows([{ ...row, courseTitle: 'Склад', testResult: 'failed', overdue: true, certificate: null, completedAt: null, durationMinutes: null }], 'en', 'UTC');
    expect(table[0]?.[0]).toBe('Course');
    expect(table[1]?.[0]).toBe('Склад');
    expect(table[1]).toContain('Failed');
    expect(table[1]).toContain('Yes');
    expect(table[1]?.at(-1)).toBe('');
  });

  it('has the same number of columns in the header and in every row in every language', () => {
    for (const locale of ['ru', 'en', 'kk', 'zh'] as const) {
      const course = courseExportRows([{ ...row, user: { firstName: 'A', lastName: 'B', email: 'a@x' } }], locale, 'UTC');
      const user = userExportRows([{ ...row, courseTitle: 'C' }], locale, 'UTC');
      expect(course[1]).toHaveLength(course[0]!.length);
      expect(user[1]).toHaveLength(user[0]!.length);
      expect(coursesExportRows([], locale)[0]).toHaveLength(11);
      expect(SHEET_NAMES.course[locale].length).toBeLessThanOrEqual(31);
    }
  });

  it('neutralises formulas in names and titles in the CSV (= + - @)', () => {
    const csv = serializeReportCsv(courseExportRows([
      { ...row, user: { firstName: '=1+1', lastName: '@SUM(A1)', email: '-x@y.kz' } },
    ], 'en', 'UTC'));
    expect(csv).toContain(`"'@SUM(A1) =1+1"`);
    expect(csv).toContain(`"'-x@y.kz"`);
    const titles = serializeReportCsv(coursesExportRows([{ title: '+cmd', assigned: 0, started: 0, completed: 0, completedPercent: 0, passed: 0, failed: 0, overdue: 0, avgPercent: null, medianPercent: null, avgDurationMinutes: null }], 'en'));
    expect(titles).toContain(`"'+cmd"`);
  });
});

import { readFileSync } from 'node:fs';
import { renderSessionReportPdf } from './checklist-session-report-pdf.js';
import { buildSessionSummary } from './checklist-session-summary.js';
import type { ChecklistSessionReport } from './checklist-session-report.js';

/**
 * PR 376: one anonymized "5S" sample drives the three artefacts of the reference parity plan -- the
 * server report (PR 370), the summary table (PR 373) and the PDF (PR 372) -- so a drift in any of
 * them fails here with the missing piece named, instead of surfacing as a judgement call.
 */
const fixture = JSON.parse(readFileSync(new URL('../../../../../tests/fixtures/checklist-session-summary-5s.json', import.meta.url), 'utf8'));
type VisibleReport = Extract<ChecklistSessionReport, { visible: true }>;
function report(): VisibleReport {
  const result = structuredClone(fixture.report);
  for (const key of ['scheduledStart', 'scheduledEnd', 'startedAt', 'completedAt']) result.header[key] = new Date(result.header[key]);
  return result;
}
const missing = (label: string, expected: string[], actual: string) => {
  const absent = expected.filter((item) => !actual.includes(item));
  if (absent.length) throw new Error(`Reference parity (${label}): ${absent.length} of ${expected.length} expected items are missing, first: ${absent.slice(0, 5).join(' | ')}`);
};

describe('reference parity guard (PR 376)', () => {
  it('report: 27 criteria, 71 of 79 points, groups 1 of 1 and 70 of 78, numbered from group and criterion order', () => {
    const data = report();
    expect(data.summary).toMatchObject({ scored: true, percentage: 90, totalScore: 71, maxScore: 79, criteriaCount: 27, passed: true });
    expect(data.groups.map(({ number, title, score, maxScore, percentage }) => [number, title, score, maxScore, percentage]))
      .toEqual([['1', 'Подготовка', 1, 1, 100], ['2', 'Порядок', 70, 78, 90]]);
    expect(data.criteria.map(({ number }) => number)).toEqual(['1.1', ...Array.from({ length: 26 }, (_, index) => `2.${index + 1}`)]);
    for (const criterion of data.criteria) {
      expect(criterion.state).toBe('answered');
      expect(criterion.levelLabel).toBeTruthy();
      expect(criterion.maxScore).toBeGreaterThan(0);
    }
    expect(data.criteria.reduce((sum, { score }) => sum + (score ?? 0), 0)).toBe(71);
    expect(data.header.timezone).toBeTruthy();
    expect(data.header.learner.department?.name).toBeTruthy();
    expect(data.header.observer.department?.name).toBeTruthy();
    expect(data.generalInfo).not.toHaveLength(0);
    expect(data.feedback).toMatchObject({ strengths: expect.any(String), developmentAreas: expect.any(String), comment: expect.any(String) });
  });

  it('summary table: reference header, "Общий балл" row, group rows and every criterion in report order', () => {
    const data = report();
    const { rows } = buildSessionSummary([data], 'ru');
    const column = rows.map((row) => String(row[0] ?? ''));
    missing('summary labels', ['Отчёт Сводка по сессии', 'Лист наблюдения', 'Фактический период', 'Запланированный период', 'Сотрудник', 'Наблюдатель',
      'Общий балл', 'Информация по наблюдению', 'Общая информация', 'Результаты сессии'], column.join('\n'));
    expect(rows[8]?.[1]).toBe('90% · 71 из 79');
    const lines = [...data.groups.map(({ number, title }) => `${number} ${title}`), ...data.criteria.map(({ number, text }) => `${number} ${text}`)];
    missing('summary rows', lines, column.join('\n'));
    const order = data.criteria.map(({ number, text }) => column.indexOf(`${number} ${text}`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > 0)).toBe(true);
  });

  it('summary table has the same shape in all four languages', () => {
    const shapes = (['ru', 'en', 'kk', 'zh'] as const).map((locale) => {
      const { rows, layout } = buildSessionSummary([report()], locale);
      return JSON.stringify({ rows: rows.length, merges: layout.merges, headers: layout.headerRows });
    });
    expect(new Set(shapes).size).toBe(1);
  });

  it('PDF: result, points, groups with their totals and every numbered criterion', async () => {
    const data = report();
    const trace: string[] = [];
    const pdf = await renderSessionReportPdf(data, { locale: 'ru', photos: [], omittedPhotos: 0, compress: false, trace });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = trace.join('\n');
    missing('pdf summary', ['5S', '90%', 'Баллы: 71 / 79', 'Пройдено', '100%  (1 / 1)', '90%  (70 / 78)'], text);
    missing('pdf rows', [...data.groups.map(({ number, title }) => `${number}. ${title}`), ...data.criteria.map(({ number, text: criterion }) => `${number}  ${criterion}`)], text);
  });
});

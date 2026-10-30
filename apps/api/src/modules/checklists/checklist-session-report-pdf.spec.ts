import { splitIntoFontRuns } from './checklist-report-pdf-fonts.js';
import { renderSessionReportPdf, type ReportPdfPhoto } from './checklist-session-report-pdf.js';
import { PDF_LABELS, type PdfLocale } from './checklist-session-report-pdf-labels.js';
import { buildSessionReport, type SessionReportInput } from './checklist-session-report.js';

type Row = SessionReportInput['breakdown']['rows'][number];

const person = (id: string, department: string | null = null) => ({
  id, firstName: 'Ann', lastName: id, email: `${id}@example.test`, department: department ? { id: `d-${id}`, name: department } : null,
});

function row(id: string, groupId: string | null, text: string, earned: number, max: number, extra: { photo?: boolean; comment?: string; state?: Row['state'] } = {}): Row {
  const levels = [0, 1, 2, 3].map((score) => ({ value: score + 1, label: `L${score}`, score, color: score === 0 ? '#C62828' : score === 3 ? '#2E7D32' : '#E65100' }));
  const state = extra.state ?? 'answered';
  return {
    item: { id, groupId, text, order: 1, points: max, weight: 1, scale: { id: 's', name: 'S', levels } } as never,
    result: state === 'skipped' ? null : {
      itemId: id, checked: true, scaleLevel: earned + 1, points: earned, comment: extra.comment ?? null,
      photoObjectKey: extra.photo ? `k-${id}` : null, photoFileName: extra.photo ? `${id}.png` : null, reviewStatus: 'pending', answerState: 'answered',
    },
    state, earned, max,
  };
}

function report(rows: Row[], overrides: Partial<SessionReportInput> = {}, feedback = true) {
  return buildSessionReport({
    session: {
      id: 'sess', instanceId: 'inst', status: 'completed', scheduledAt: new Date('2026-10-01T10:00:00Z'), durationMinutes: 60,
      startedAt: new Date('2026-10-01T10:05:00Z'), timezone: 'Asia/Almaty', locationCapturePolicy: 'off',
      strengths: 'Чистая зона', developmentAreas: 'Қазақша: Ә Ғ Ұ Ө', nextSteps: '继续保持',
      contextFieldsSnapshot: [{ id: 'f1', label: 'Place', type: 'text', required: false, order: 1 }], contextValues: { f1: 'Hall' },
    },
    instance: { id: 'inst', status: 'completed', totalScore: 71, maxScore: 79, percentage: 90, passed: true, scored: true, completedAt: new Date('2026-10-01T11:00:00Z') },
    checklistId: 'chk', learner: person('learner', 'Sales'), observer: person('observer'),
    breakdown: {
      checklist: { title: '5S', scoringMode: 'sum_points', passThreshold: 70, scaleLevels: null, feedbackEnabled: feedback, itemGroups: [{ id: 'g1', title: 'Sort', order: 1 }, { id: 'g2', title: 'Shine', order: 2 }] },
      rows, totals: { totalScore: 71, maxScore: 79, scored: true },
    },
    formula: 'snapshot',
    settings: { highPerformanceThreshold: 90, lowThreshold: 60, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' } },
    visible: true, locationCaptures: [], ...overrides,
  });
}

function sample5s() {
  const rows = [row('c1', 'g1', 'First criterion', 1, 1)];
  for (let n = 0; n < 26; n += 1) rows.push(row(`d${n}`, 'g2', `Criterion ${n}`, n < 22 ? 3 : n < 24 ? 2 : 0, 3, { comment: n === 0 ? 'Комментарий, Қазақша, 中文说明' : undefined }));
  return rows;
}

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\n/g) ?? []).length;

/** Reads the `r g b scn` colour operators out of an uncompressed file. */
function fillColors(pdf: Buffer) {
  const triples = [...pdf.toString('latin1').matchAll(/(\d(?:\.\d+)?) (\d(?:\.\d+)?) (\d(?:\.\d+)?) scn?\b/g)];
  return triples.map((match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const);
}
function hasColor(pdf: Buffer, hex: string) {
  const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return fillColors(pdf).some((triple) => triple.every((value, index) => Math.abs(value - target[index]!) < 0.003));
}

async function render(data: ReturnType<typeof report>, locale: PdfLocale = 'ru', photos: ReportPdfPhoto[] = [], omittedPhotos = 0) {
  const trace: string[] = [];
  const pdf = await renderSessionReportPdf(data, { locale, photos, omittedPhotos, compress: false, trace });
  if (process.env['PDF_DUMP']) (await import('node:fs')).writeFileSync(`${process.env['PDF_DUMP']}-${locale}.pdf`, pdf);
  return { pdf, text: trace.join('\n') };
}

describe('renderSessionReportPdf (PR 372)', () => {
  it('renders the 5S sample: header, 90% result, 71 of 79 points, groups and every criterion', async () => {
    const { pdf, text } = await render(report(sample5s()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    for (const expected of ['5S', '90%', 'Баллы: 71 / 79', 'Пройдено', '1. Sort', '2. Shine', '100%  (1 / 1)', '90%  (70 / 78)', '1.1  First criterion', '2.26  Criterion 25', 'Hall']) {
      expect(text).toContain(expected);
    }
    expect(pageCount(pdf)).toBe(2);
    expect(text).toContain('Стр. 2 из 2');
  });

  it('paints rows with the owner-chosen colours: green, orange and red fills, stripes and group bars', async () => {
    const data = report(sample5s());
    if (!data.visible) throw new Error('unreachable');
    const { pdf } = await render(data);
    for (const criterion of data.criteria) {
      expect(hasColor(pdf, criterion.color!.light.fill)).toBe(true);
      expect(hasColor(pdf, criterion.color!.color)).toBe(true);
    }
    expect(hasColor(pdf, '#2E7D32')).toBe(true);
    expect(hasColor(pdf, '#C62828')).toBe(true);
  });

  it.each<PdfLocale>(['ru', 'en', 'kk', 'zh'])('speaks %s in the file', async (locale) => {
    const labels = PDF_LABELS[locale];
    const { text } = await render(report(sample5s()), locale);
    expect(text).toContain(labels.title.toUpperCase());
    expect(text).toContain(labels.criteria);
    expect(text).toContain(labels.strengths);
  });

  it('covers Cyrillic, Kazakh and Chinese without replacing them, and prints "?" for what no font has', () => {
    const text = 'Привет Ә Ғ Қ Ң Ө Ұ Ү Һ І 中文报告：优势';
    expect(splitIntoFontRuns(text, 400).map((run) => run.text).join('')).toBe(text);
    expect(splitIntoFontRuns(text, 700).map((run) => run.text).join('')).toBe(text);
    expect(splitIntoFontRuns('a\u{1F600}b', 400).map((run) => run.text).join('')).toBe('a?b');
  });

  it('embeds the photo as a thumbnail inside its criterion row, and says so when a photo cannot be read or was left out', async () => {
    const rows = [row('p1', null, 'Floor', 3, 3, { photo: true }), row('p2', null, 'Shelf', 3, 3, { photo: true }), row('p3', null, 'Door', 3, 3, { photo: true })];
    const { pdf, text } = await render(report(rows), 'en', [
      { criterionId: 'p1', buffer: PIXEL, mimeType: 'image/png' },
      { criterionId: 'p2', buffer: null, mimeType: null },
      { criterionId: 'p3', buffer: Buffer.from('not an image'), mimeType: 'image/png' },
    ], 4);
    expect(pdf.toString('latin1')).toContain('/Subtype /Image');
    expect(text).toContain('1  Floor');
    expect(text).not.toContain('Photos\n');
    expect(text.match(/Photo unavailable/g)).toHaveLength(2);
    expect(text).toContain('Photos not included in the file: 4');
  });

  it('handles a 30-photo session within the page budget', async () => {
    const rows = Array.from({ length: 30 }, (_, n) => row(`p${n}`, null, `Spot ${n}`, 3, 3, { photo: true }));
    const photos = rows.map((entry) => ({ criterionId: entry.item.id, buffer: PIXEL, mimeType: 'image/png' }));
    const { pdf } = await render(report(rows), 'ru', photos);
    expect(pageCount(pdf)).toBeLessThanOrEqual(12);
  });

  it('prints only the header and a note when the result is still hidden from the learner', async () => {
    const hidden = report(sample5s(), { visible: false });
    const { pdf, text } = await render(hidden, 'en');
    expect(text).toContain('The result is still hidden from the employee.');
    expect(text).not.toContain('Criterion 3');
    expect(pageCount(pdf)).toBe(1);
  });

  it('marks skipped criteria with a label instead of a score', async () => {
    const { text } = await render(report([row('s1', null, 'Not applicable', 0, 0, { state: 'skipped' })]), 'en');
    expect(text).toContain('Skipped');
  });
});

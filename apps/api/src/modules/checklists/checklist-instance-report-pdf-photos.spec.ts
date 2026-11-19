import { jest } from '@jest/globals';
import { exportSessionReportPdf, REPORT_PDF_LIMITS } from './checklist-session-report-pdf-export.js';
import { buildSessionReport, type SessionReportInput } from './checklist-session-report.js';

type Row = SessionReportInput['breakdown']['rows'][number];

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function photoRow(id: string): Row {
  const levels = [0, 1, 2, 3].map((score) => ({ value: score + 1, label: `L${score}`, score, color: '#2E7D32' }));
  return {
    item: { id, groupId: null, text: `Criterion ${id}`, order: 1, points: 3, weight: 1, scale: { id: 's', name: 'S', levels } } as never,
    result: { itemId: id, checked: true, scaleLevel: 4, points: 3, comment: null, photoObjectKey: `k-${id}`, photoFileName: `${id}.png`, reviewStatus: 'pending', answerState: 'answered' },
    state: 'answered', earned: 3, max: 3,
  };
}

/** PR 478: the report of a single check goes through the same photo limits as the report of a session. */
describe('PDF of the filled-in check: photo limits', () => {
  const target = { action: 'checklist_instance.report_pdf_downloaded' as const, targetType: 'checklist_instance', targetId: 'inst', summary: 'Downloaded', filename: 'check.pdf' };

  async function exportWith(count: number, read: (key: string, max: number) => Promise<Buffer | null>) {
    const rows = Array.from({ length: count }, (_, n) => photoRow(`p${n}`));
    const person = (id: string) => ({ id, firstName: 'Ann', lastName: id, email: `${id}@example.test`, department: null });
    const built = buildSessionReport({
      session: {
        id: 'sess', instanceId: 'inst', status: 'completed', scheduledAt: new Date('2026-10-01T10:00:00Z'), durationMinutes: 60,
        startedAt: new Date('2026-10-01T10:05:00Z'), timezone: 'Asia/Almaty', locationCapturePolicy: 'off',
        strengths: null, developmentAreas: null, nextSteps: null, contextFieldsSnapshot: null, contextValues: null,
      },
      instance: { id: 'inst', status: 'completed', totalScore: 3, maxScore: 3, percentage: 100, passed: true, scored: true, completedAt: new Date('2026-10-01T11:00:00Z') },
      checklistId: 'chk', learner: person('learner'), observer: null,
      breakdown: {
        checklist: { title: '5S', scoringMode: 'sum_points', passThreshold: 70, scaleLevels: null, feedbackEnabled: false, itemGroups: [] },
        rows, totals: { totalScore: 3, maxScore: 3, scored: true },
      },
      formula: 'snapshot',
      settings: { highPerformanceThreshold: 90, lowThreshold: 60, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' } },
      visible: true, locationCaptures: [],
    } as never);
    const report = { ...built, sessionId: null } as never;
    const record = jest.fn(async () => undefined);
    const prisma = { checklistItemResult: { findMany: jest.fn(async () => rows.map((r) => ({ itemId: r.item.id, photoObjectKey: `k-${r.item.id}`, photoMimeType: 'image/png' }))) } };
    const result = await exportSessionReportPdf({ prisma, auditLog: { record }, readPhotoBytes: read } as never, report, 'org', { id: 'u', locale: 'en' }, target);
    return { result, metadata: (record.mock.calls[0] as unknown as [{ metadata: Record<string, number> }])[0].metadata };
  }

  it('embeds at most the allowed number of photos and counts the rest as left out', async () => {
    const { result, metadata } = await exportWith(REPORT_PDF_LIMITS.maxPhotos + 5, async () => PIXEL);
    expect(metadata).toMatchObject({ photosEmbedded: REPORT_PDF_LIMITS.maxPhotos, photosOmitted: 5 });
    expect(result.filename).toBe('check.pdf');
    expect(result.pdf.length).toBeLessThan(REPORT_PDF_LIMITS.maxBytes);
  }, 60_000);

  it('still builds the file when a photo cannot be read', async () => {
    const { metadata } = await exportWith(3, async () => null);
    expect(metadata).toMatchObject({ photosEmbedded: 0, photosOmitted: 0 });
  }, 30_000);
});

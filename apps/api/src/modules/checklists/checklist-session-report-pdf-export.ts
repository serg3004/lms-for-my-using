import { GatewayTimeoutException, PayloadTooLargeException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { exportLocale } from './checklist-report-csv.js';
import { renderSessionReportPdf, type ReportPdfPhoto } from './checklist-session-report-pdf.js';
import type { ChecklistSessionReport } from './checklist-session-report.js';

/** PR 372 limits: what one PDF may weigh, how long it may take, and how many photos it embeds. */
export const REPORT_PDF_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  timeoutMs: 30_000,
  maxPhotos: 40,
  maxPhotoBytes: 4 * 1024 * 1024,
  maxPhotoTotalBytes: 16 * 1024 * 1024,
  fetchConcurrency: 4,
} as const;

const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

type Deps = {
  prisma: PrismaService;
  auditLog: AuditLogService;
  readPhotoBytes: (objectKey: string, maxBytes: number) => Promise<Buffer | null>;
};

async function withDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GatewayTimeoutException('The PDF took too long to build. Try again or download the CSV summary.')), Math.max(1, deadline - Date.now()));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Loads the photos that fit the limits (in report order); the rest are only counted so the file can say so. */
async function loadPhotos(deps: Deps, report: Extract<ChecklistSessionReport, { visible: true }>, organizationId: string, deadline: number) {
  const withPhoto = report.criteria.filter((criterion) => criterion.photo);
  if (withPhoto.length === 0) return { photos: [] as ReportPdfPhoto[], omitted: 0, loaded: 0 };
  const rows = await deps.prisma.checklistItemResult.findMany({
    where: { instanceId: report.instanceId, itemId: { in: withPhoto.map((criterion) => criterion.id) }, photoObjectKey: { not: null }, instance: { organizationId } },
    select: { itemId: true, photoObjectKey: true, photoMimeType: true },
  });
  const byItem = new Map(rows.map((row) => [row.itemId, row]));
  const wanted = withPhoto.flatMap((criterion) => { const row = byItem.get(criterion.id); return row ? [{ criterionId: criterion.id, key: row.photoObjectKey!, mimeType: row.photoMimeType ?? '' }] : []; });
  const embedded = wanted.slice(0, REPORT_PDF_LIMITS.maxPhotos);
  let omitted = wanted.length - embedded.length;

  const photos: ReportPdfPhoto[] = [];
  let total = 0;
  for (let index = 0; index < embedded.length; index += REPORT_PDF_LIMITS.fetchConcurrency) {
    const batch = embedded.slice(index, index + REPORT_PDF_LIMITS.fetchConcurrency);
    const loaded = await Promise.all(batch.map(async (entry) => {
      if (!EMBEDDABLE.has(entry.mimeType) || Date.now() > deadline) return null;
      return deps.readPhotoBytes(entry.key, REPORT_PDF_LIMITS.maxPhotoBytes).catch(() => null);
    }));
    batch.forEach((entry, position) => {
      const buffer = loaded[position] ?? null;
      if (buffer && total + buffer.length > REPORT_PDF_LIMITS.maxPhotoTotalBytes) { omitted += 1; return; }
      if (buffer) { total += buffer.length; photos.push({ criterionId: entry.criterionId, buffer, mimeType: entry.mimeType }); } else photos.push({ criterionId: entry.criterionId, buffer: null, mimeType: null });
    });
  }
  return { photos, omitted, loaded: photos.filter((photo) => photo.buffer).length };
}

/**
 * PR 372: builds the PDF of an already access-checked report. Photos are embedded within the count and
 * size limits, the whole build has a deadline (504) and the result a size cap (413). Every download is
 * audited with its size and photo counts, never with the content.
 */
export async function exportSessionReportPdf(
  deps: Deps,
  report: ChecklistSessionReport,
  organizationId: string,
  actor: { id: string; locale: string | null },
) {
  const deadline = Date.now() + REPORT_PDF_LIMITS.timeoutMs;
  const locale = exportLocale(actor.locale);
  const built = await withDeadline((async () => {
    const photoSet = report.visible ? await loadPhotos(deps, report, organizationId, deadline) : { photos: [], omitted: 0, loaded: 0 };
    const pdf = await renderSessionReportPdf(report, { locale, photos: photoSet.photos, omittedPhotos: photoSet.omitted });
    return { pdf, photoSet };
  })(), deadline);

  if (built.pdf.length > REPORT_PDF_LIMITS.maxBytes) {
    throw new PayloadTooLargeException(`The PDF is larger than ${REPORT_PDF_LIMITS.maxBytes / 1024 / 1024} MB. Download the CSV summary instead.`);
  }
  await deps.auditLog.record({
    organizationId,
    actorId: actor.id,
    action: 'checklist_session.report_pdf_downloaded',
    targetType: 'checklist_session',
    targetId: report.sessionId,
    summary: 'Downloaded the checklist session report as PDF',
    metadata: { locale, bytes: built.pdf.length, photosEmbedded: built.photoSet.loaded, photosOmitted: built.photoSet.omitted },
  });
  return { filename: `checklist-session-${report.sessionId}.pdf`, pdf: built.pdf };
}

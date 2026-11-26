import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { withoutLearnerPoints } from './checklist-learner-result.js';
import { exportSessionReportPdf } from './checklist-session-report-pdf-export.js';
import { buildSessionReport, type ChecklistSessionReport, type ReportPerson } from './checklist-session-report.js';
import { freezeReportSettings, loadEffectiveSettings, readFrozenReportSettings } from './checklist-settings-overrides.js';
import type { TransferHistoryRow } from './checklist-instance-transfer.js';
import type { ChecklistsService } from './checklists.service.js';

/**
 * PR 478: the filled-in sheet of a self-filled check as a report (the same object the session report is), with a PDF.
 * The rules of scoring, colours and the PDF are the ones of the session report -- this module only gathers the input
 * (there is no observer, no schedule and no location) and decides what the viewer may see.
 *
 * - Before the check is completed the report holds the answers, comments and photos only: no points, percentage,
 *   verdict or colour (the rule of PR 406а). After completion it is the session report.
 * - The executor sees points only when the sheet shows them to the employee (PR 366); other roles see them in their area.
 * - A session instance has its own report (`/checklist-sessions/:id/report`), a guest pass has none: both answer 400.
 * - The hand-over history (PR 477) is part of the report.
 */

export type ReportTransfer = { id: string; at: Date; note: string | null; from: string | null; to: string | null };

/** The session report without a session id and an observer, plus the hand-over history. */
export type ChecklistInstanceReportData = ChecklistSessionReport extends infer R
  ? R extends { header: infer H }
    ? Omit<R, 'header' | 'sessionId'> & { sessionId: null; header: Omit<H, 'observer'> & { observer: null }; transfers: ReportTransfer[] }
    : never
  : never;

export type InstanceReportViewer = { id: string; organizationId: string; locale: string | null; privileged: boolean };

const personName = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}`.trim() : null);

export function toReportTransfers(rows: ReadonlyArray<TransferHistoryRow>): ReportTransfer[] {
  return rows.map((row) => ({ id: row.id, at: row.at, note: row.note, from: personName(row.from), to: personName(row.to) }));
}

type Deps = {
  prisma: PrismaService;
  auditLog: AuditLogService;
  breakdown: ChecklistsService['getScoreBreakdown'];
  history: (instanceId: string, organizationId: string) => Promise<TransferHistoryRow[]>;
  readPhotoBytes: (objectKey: string, maxBytes: number) => Promise<Buffer | null>;
};

export class ChecklistInstanceReport {
  constructor(private readonly deps: Deps) {}

  /** Access (own check, or the reviewer's area) is decided by the controller; this only refuses what has no report. */
  async get(instanceId: string, viewer: InstanceReportViewer): Promise<ChecklistInstanceReportData> {
    const { prisma } = this.deps;
    const organizationId = viewer.organizationId;
    const row = await prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: {
        id: true, userId: true, status: true, guestName: true, checklistId: true, totalScore: true, maxScore: true, percentage: true,
        passed: true, scored: true, completedAt: true, createdAt: true, reportSettings: true, session: { select: { id: true } },
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, timezone: true,
            departmentMemberships: { where: { organizationId, isPrimary: true, effectiveTo: null }, select: { department: { select: { id: true, name: true } } }, take: 1 },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Checklist assignment not found');
    if (row.session) throw new BadRequestException('This check belongs to a session: open the session report');
    if (row.guestName) throw new BadRequestException('A guest pass has no report');

    const finished = row.status === 'completed';
    const frozen = readFrozenReportSettings(row.reportSettings);
    const [breakdown, effective, revision, transfers, voiceNotes] = await Promise.all([
      this.deps.breakdown(instanceId, organizationId),
      frozen ? Promise.resolve(null) : loadEffectiveSettings(prisma, organizationId, row.checklistId),
      prisma.checklistScoreRevision.findFirst({ where: { organizationId, instanceId }, orderBy: { createdAt: 'desc' }, select: { formula: true } }),
      this.deps.history(instanceId, organizationId),
      prisma.checklistVoiceNote.findMany({ where: { instanceId, organizationId }, select: { itemId: true, place: true, field: true, durationMs: true } }),
    ]);
    const executor: ReportPerson = {
      id: row.user.id, firstName: row.user.firstName, lastName: row.user.lastName, email: row.user.email,
      department: row.user.departmentMemberships[0]?.department ?? null,
    };
    const pointsVisible = viewer.privileged || (finished && breakdown.checklist.showPointsToLearner === true && breakdown.checklist.scoringMode !== 'none');
    // The session report builder needs a session and an observer; the executor stands in and both are dropped below.
    const built = buildSessionReport({
      session: {
        id: instanceId, instanceId, status: row.status, scheduledAt: null, durationMinutes: null, startedAt: row.createdAt, timezone: row.user.timezone,
        locationCapturePolicy: 'off', strengths: null, developmentAreas: null, nextSteps: null, feedbackAnswers: null, contextFieldsSnapshot: null, contextValues: null,
      },
      instance: {
        id: instanceId, status: row.status, totalScore: row.totalScore, maxScore: row.maxScore,
        percentage: finished ? row.percentage : null, passed: finished ? row.passed : null, scored: finished ? row.scored : null, completedAt: row.completedAt,
      },
      checklistId: row.checklistId,
      learner: executor,
      observer: executor,
      breakdown,
      formula: revision?.formula ?? 'snapshot',
      settings: frozen ?? freezeReportSettings(effective!),
      visible: true,
      pointsVisible,
      voiceNotes,
      locationCaptures: [],
    });

    const withoutSession = { ...built, sessionId: null, header: { ...built.header, observer: null }, transfers: toReportTransfers(transfers), feedback: null, feedbackVoice: null, feedbackForm: null, location: { policy: 'off', captures: [] } };
    if (!built.visible) throw new ForbiddenException('The report is not available');
    const report = (finished
      ? withoutSession
      : {
        ...withoutSession,
        summary: null,
        // The group titles stay (they head the criteria); their results go.
        groups: built.groups.map((group) => ({ ...group, score: 0, maxScore: 0, percentage: null, color: null })),
        criteria: built.criteria.map((criterion) => ({ ...criterion, score: null, maxScore: null, color: null })),
      }) as unknown as ChecklistInstanceReportData;
    return pointsVisible ? report : withoutLearnerPoints(report);
  }

  /** The PDF of `get`: same access and masking, audited per download with sizes only. */
  async pdf(instanceId: string, viewer: InstanceReportViewer) {
    const report = await this.get(instanceId, viewer);
    return exportSessionReportPdf(
      { prisma: this.deps.prisma, auditLog: this.deps.auditLog, readPhotoBytes: this.deps.readPhotoBytes },
      report, viewer.organizationId, { id: viewer.id, locale: viewer.locale },
      { action: 'checklist_instance.report_pdf_downloaded', targetType: 'checklist_instance', targetId: instanceId, summary: 'Downloaded the filled-in checklist as a PDF report', filename: `checklist-${instanceId}.pdf` },
    );
  }
}

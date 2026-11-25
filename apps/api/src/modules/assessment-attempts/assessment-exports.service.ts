import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { PrismaService } from '../../database/prisma.service.js';
import { isOrgWideGrant, isOwnOnlyGrant, markRequestScope } from '../auth/public.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import { CourseAccessPolicy, isInstructorCourseScoped } from '../course-access/public.js';
import { ManagerTeamScope, type TeamScopeActor } from '../manager-team-scope/public.js';
import { assessmentAnalyticsPeriod, assessmentAnalyticsQuery } from './assessment-analytics.js';
import { buildAssessmentExport, exportLabels, type ExportTable } from './assessment-export-file.js';
import { AssessmentResultsService } from './assessment-results.service.js';
import { attemptScope } from './attempt-scope.js';

const JOB = 'assessment.export';
const BACKGROUND_THRESHOLD = 500;

export const assessmentExportInput = z.object({
  format: z.enum(['xlsx', 'pdf']),
  view: z.enum(['results', 'questions', 'folder']),
  locale: z.enum(['en', 'ru', 'kk', 'zh']),
  filters: assessmentAnalyticsQuery,
});
type ExportInput = z.infer<typeof assessmentExportInput>;

type ExportJob = {
  assessmentId: string;
  actor: TeamScopeActor;
  scope: { orgWide: boolean; ownOnly: boolean };
  input: ExportInput;
};

type ExportResult = { file: string; attemptIds: string[]; assessmentIds: string[] };

@Injectable()
export class AssessmentExportsService implements OnModuleInit {
  private readonly teamScope = new ManagerTeamScope();

  constructor(
    private readonly prisma: PrismaService,
    private readonly results: AssessmentResultsService,
    private readonly jobs: BackgroundJobsService,
    private readonly courses: CourseAccessPolicy,
  ) {}

  onModuleInit() {
    this.jobs.registerHandler(JOB, async ({ data }) => {
      const { assessmentId, actor, scope, input } = data as ExportJob;
      markRequestScope(actor, scope);
      const target = await this.target(assessmentId, actor, input.view);
      const { file, attemptIds } = await this.generate(target, actor, input);
      return { file: file.toString('base64'), attemptIds, assessmentIds: target.ids };
    });
  }

  async start(assessmentId: string, actor: TeamScopeActor, input: ExportInput) {
    const target = await this.target(assessmentId, actor, input.view);
    const { filters } = input;
    const count = await this.prisma.assessmentAttempt.count({
      where: {
        ...this.visibleAttempts(actor, target.ids),
        ...assessmentAnalyticsPeriod(filters),
        ...(filters.attemptId ? { id: filters.attemptId } : {}),
      },
      take: BACKGROUND_THRESHOLD + 1,
    });
    if (count > BACKGROUND_THRESHOLD || target.ids.length > 25) {
      const scope = { orgWide: isOrgWideGrant(actor), ownOnly: isOwnOnlyGrant(actor) };
      const { id } = await this.jobs.enqueue(JOB, {
        assessmentId, actor: { id: actor.id, organizationId: actor.organizationId, roles: actor.roles }, scope, input,
      }, { idempotencyKey: randomUUID() });
      return { id };
    }

    const { file } = await this.generate(target, actor, input);
    return { file, format: input.format };
  }

  async status(assessmentId: string, id: string, actor: TeamScopeActor) {
    const job = await this.job(assessmentId, id, actor);
    return { state: job.state };
  }

  async download(assessmentId: string, id: string, actor: TeamScopeActor) {
    const job = await this.job(assessmentId, id, actor);
    const result = job.result as ExportResult | undefined;
    if (job.state !== 'completed' || !result) throw new NotFoundException('Export file unavailable');

    // Reapply the viewer's current access, including team membership, before releasing a stored file.
    const target = await this.target(assessmentId, actor, job.input.view);
    const allowed = new Set(target.ids);
    if (result.assessmentIds.some((assessment) => !allowed.has(assessment))) throw new NotFoundException('Export file unavailable');
    for (let offset = 0; offset < result.attemptIds.length; offset += 5_000) {
      const ids = result.attemptIds.slice(offset, offset + 5_000);
      const count = await this.prisma.assessmentAttempt.count({
        where: { ...this.visibleAttempts(actor, result.assessmentIds), id: { in: ids } },
      });
      if (count !== ids.length) throw new NotFoundException('Export file unavailable');
    }
    return { file: Buffer.from(result.file, 'base64'), format: job.input.format };
  }

  private async job(assessmentId: string, id: string, actor: TeamScopeActor) {
    const job = await this.jobs.getResult(JOB, id);
    const data = job?.data as ExportJob | undefined;
    if (!job || !data || data.assessmentId !== assessmentId
      || data.actor.id !== actor.id || data.actor.organizationId !== actor.organizationId) {
      throw new NotFoundException('Export not found');
    }
    return { ...job, input: data.input };
  }

  private visibleAttempts(actor: TeamScopeActor, ids: string[]): Prisma.AssessmentAttemptWhereInput {
    return {
      ...attemptScope(this.teamScope, actor),
      assessmentId: { in: ids }, organizationId: actor.organizationId, deletedAt: null,
      status: 'completed', countsTowardResults: true,
    };
  }

  private async target(assessmentId: string, actor: TeamScopeActor, view: ExportInput['view']) {
    await this.courses.assertResourceAccess('assessment', assessmentId, actor);
    const { organizationId } = actor;
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { title: true, folder: { select: { id: true, name: true, deletedAt: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (view !== 'folder') return { title: assessment.title, ids: [assessmentId] };

    const { folder } = assessment;
    if (!folder || folder.deletedAt) throw new NotFoundException('Assessment folder not found');
    const tests = await this.prisma.assessment.findMany({
      where: {
        organizationId, folderId: folder.id, deletedAt: null,
        ...(isInstructorCourseScoped(actor) ? { course: this.courses.courseWhere(actor) } : {}),
      },
      select: { id: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return { title: folder.name, ids: tests.map(({ id }) => id) };
  }

  private async generate(target: { title: string; ids: string[] }, actor: TeamScopeActor, input: ExportInput) {
    const labels = exportLabels[input.locale];
    const table: ExportTable = { label: labels[input.view], title: target.title, headers: [], rows: [], widths: [] };
    const attemptIds: string[] = [];
    for (const id of target.ids) {
      const analytics = await this.results.getAssessmentAnalytics(id, actor, input.filters, input.view);
      for (const row of analytics.rows) attemptIds.push(row.id);
      if (input.view === 'results') {
        table.rows = analytics.rows.map((row) => [
          row.name, row.department, row.id, `${row.score}/${row.maxScore} · ${row.percentage}%`,
          row.passed ? labels.passed : labels.failed, row.date, labels[row.place],
        ]);
      } else if (input.view === 'questions') {
        table.rows = analytics.questions.map(({ text, total, correct, trap }) => [
          text || labels.untitledQuestion, total, correct, Math.round(100 * correct / total),
          trap ? trap.text || labels.untitledOption : null, trap?.count ?? null,
        ]);
      } else {
        table.rows.push([analytics.title, analytics.count, analytics.passed,
          analytics.count ? Math.round(100 * analytics.passed / analytics.count) : null, analytics.average]);
      }
    }
    const columns = {
      results: { headers: labels.resultColumns, widths: [138, 130, 194, 90, 75, 75, 80] },
      questions: { headers: labels.questionColumns, widths: [250, 70, 75, 90, 220, 77] },
      folder: { headers: labels.folderColumns, widths: [382, 100, 90, 100, 110] },
    };
    return { file: await buildAssessmentExport(input.format, { ...table, ...columns[input.view] }), attemptIds };
  }
}

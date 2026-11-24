import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { frozenAnswerQuestionSchema, longreadResultMetadataSchema } from '../../common/assessment-frozen.js';
import { assessmentAttemptOrder, completedAssessmentAttempts, effectiveAssessmentResult, readAssessmentPolicy } from '../../common/assessment-policy.js';
import { publishAssessmentResult } from '../../common/assessment-recording.js';
import { PrismaService } from '../../database/prisma.service.js';
import { EffectivePermissionsLookup, type CurrentUser } from '../auth/public.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';

export const reviewQueueQuery = z.object({
  assessmentId: z.guid().optional(),
  assessment: z.string().trim().min(1).max(200).optional(),
  department: z.string().trim().min(1).max(200).optional(),
  departmentId: z.guid().optional(),
  dueBefore: z.iso.datetime().optional(),
  answerId: z.guid().optional(),
  after: z.guid().optional(),
});

export const reviewAnswerInput = z.object({
  score: z.number().int().nonnegative(),
  comment: z.string().trim().max(4000).refine((text) =>
    [...text].every((character) => {
      const code = character.codePointAt(0)!;
      return code !== 0 && !(code >= 0xd800 && code <= 0xdfff);
    })),
}).strict();

const reviewDelayMs = 48 * 60 * 60 * 1000;

@Injectable()
export class AssessmentManualReviewService {
  constructor(private readonly prisma: PrismaService,
    private readonly permissions: EffectivePermissionsLookup,
    private readonly teamScope: ManagerTeamScope,
    private readonly jobs: BackgroundJobsService) {}

  onModuleInit() {
    const job = 'assessments.manual-review-reminders';
    this.jobs.registerHandler(job, async () => { await this.remind(); });
    this.jobs.registerRecurring(job, {}, {
      schedulerId: 'assessment-manual-review-reminders-v1', everyMs: 60 * 60 * 1000, attempts: 3, backoffMs: 1000,
    });
  }

  async remind() {
    const overdue = new Date(Date.now() - reviewDelayMs);
    const where = { status: 'pending_review', deletedAt: null, reviewRemindedAt: null, completedAt: { lte: overdue } } as const;
    let after: string | undefined;
    for (;;) {
      const page = await this.prisma.assessmentAttempt.findMany({
        where: { ...where, id: after ? { gt: after } : undefined },
        select: { id: true, organizationId: true, userId: true, assessment: { select: { createdBy: true, title: true } } },
        orderBy: { id: 'asc' }, take: 50,
      });
      for (const attempt of page) {
        await this.prisma.$transaction(async (tx) => {
          const { id, organizationId, assessment } = attempt;
          const employee = await tx.user.findUnique({
            where: { id: attempt.userId },
            select: { groupMemberships: {
              where: { organizationId, deletedAt: null, group: { organizationId, status: 'active', deletedAt: null } },
              select: { group: { select: { managers: { where: { organizationId, deletedAt: null }, select: { managerId: true } } } } },
            } },
          });
          const teamManagerIds = employee?.groupMemberships.flatMap(({ group }) => group.managers.map(({ managerId }) => managerId)) ?? [];
          const eligible = {
            organizationId, status: 'active', deletedAt: null,
            memberships: { some: { organizationId } },
            OR: [{ memberships: { none: { organizationId, role: 'manager' } } }, { id: { in: teamManagerIds } }],
          } satisfies Prisma.UserWhereInput;
          const author = assessment.createdBy ? await tx.user.findFirst({
            where: { ...eligible, id: assessment.createdBy }, select: { id: true },
          }) : null;
          const substitute = author ? null : await tx.userCustomRoleAssignment.findFirst({
            where: { organizationId, state: 'active', organization: { customRolesEnabled: true },
              role: { organizationId, state: 'active', permissions: { some: { action: 'assessment.answer.review', scope: 'organization' } } },
              user: eligible },
            orderBy: { userId: 'asc' }, select: { userId: true },
          });
          const recipientId = author?.id ?? substitute?.userId;
          if (!recipientId) return;
          const claimed = await tx.assessmentAttempt.updateMany({ where: { ...where, id }, data: { reviewRemindedAt: new Date() } });
          if (!claimed.count) return;
          await tx.notification.create({ data: {
            organizationId, userId: recipientId, type: 'assessment_review_due',
            data: { assessmentTitle: assessment.title }, link: '/learn/assessment-reviews',
          } });
        });
      }
      if (page.length < 50) return;
      after = page.at(-1)!.id;
    }
  }

  private async scope(actor: CurrentUser, write: boolean): Promise<Prisma.AssessmentAttemptWhereInput> {
    const permissions = await this.permissions.forUser(actor);
    const granted = permissions.get('assessment.answer.review')?.scopes.has('organization');
    const manager = actor.roles.includes('manager');
    return {
      organizationId: actor.organizationId, status: 'pending_review', deletedAt: null,
      ...(manager ? { user: this.teamScope.user({ ...actor, roles: ['manager'] }) } : {}),
      ...(!granted && (write || !manager) ? { assessment: { createdBy: actor.id } } : {}),
    };
  }

  async queue(actor: CurrentUser, query: z.infer<typeof reviewQueueQuery>) {
    const scope = await this.scope(actor, false);
    const writable = await this.scope(actor, true);
    const rows = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        organizationId: actor.organizationId, deletedAt: null, reviewPending: true,
        id: query.answerId ?? (query.after ? { gt: query.after } : undefined),
        attempt: { AND: [scope, {
          assessmentId: query.assessmentId,
          assessment: query.assessment ? { title: { contains: query.assessment, mode: 'insensitive' } } : undefined,
          completedAt: query.dueBefore ? { lte: new Date(Date.parse(query.dueBefore) - reviewDelayMs) } : undefined,
          user: query.departmentId || query.department ? { departmentMemberships: { some: {
            organizationId: actor.organizationId, departmentId: query.departmentId, effectiveTo: null,
            department: query.department ? { name: { contains: query.department, mode: 'insensitive' } } : undefined,
          } } } : undefined,
        }] },
      },
      take: 51,
      orderBy: { id: 'asc' },
      select: { id: true, response: true, frozenQuestion: true, attempt: { select: {
        assessmentId: true, completedAt: true, assessment: { select: { title: true, createdBy: true } },
        user: { select: { firstName: true, lastName: true } },
      } } },
    });
    return { next: rows.length > 50 ? rows[49]!.id : null, answers: rows.slice(0, 50).map((row) => {
      const frozen = frozenAnswerQuestionSchema.parse(row.frozenQuestion);
      const response = row.response as { text: string };
      return {
        id: row.id, response: response.text, question: frozen.question.title, maxScore: frozen.question.points,
        assessmentId: row.attempt.assessmentId, assessment: row.attempt.assessment.title,
        employee: row.attempt.user,
        dueAt: new Date(row.attempt.completedAt!.getTime() + reviewDelayMs),
        canReview: !writable.assessment || row.attempt.assessment.createdBy === actor.id,
      };
    }) };
  }

  async review(actor: CurrentUser, answerId: string, input: z.infer<typeof reviewAnswerInput>) {
    const scope = await this.scope(actor, true);
    return this.prisma.$transaction(async (tx) => {
      const where = { id: answerId, organizationId: actor.organizationId, deletedAt: null, reviewPending: true, attempt: scope };
      const pending = await tx.assessmentAttemptAnswer.findFirst({ where, select: { attemptId: true } });
      if (!pending) throw new NotFoundException('Pending answer not found');
      await tx.$queryRaw`SELECT id FROM assessment_attempts WHERE id = ${pending.attemptId}::uuid FOR UPDATE`;
      const answer = await tx.assessmentAttemptAnswer.findFirst({
        where, include: { attempt: { include: { assessment: { select: { policy: true, passingScore: true } } } } },
      });
      if (!answer) throw new NotFoundException('Pending answer not found');
      const { question } = frozenAnswerQuestionSchema.parse(answer.frozenQuestion);
      if (input.score > question.points) throw new BadRequestException('Score exceeds question points');
      await tx.assessmentAttemptAnswer.update({ where: { id: answer.id }, data: {
        score: input.score, isCorrect: input.score === question.points, reviewPending: false,
        reviewComment: input.comment, reviewedBy: actor.id,
      } });
      const attempt = answer.attempt;
      const totals = await tx.assessmentAttemptAnswer.groupBy({
        by: ['reviewPending'], where: { attemptId: attempt.id, deletedAt: null }, _sum: { score: true },
      });
      if (totals.some((total) => total.reviewPending)) return { status: 'pending_review' };

      const score = totals[0]?._sum.score ?? 0;
      const percentage = attempt.maxScore ? Math.round(score * 100 / attempt.maxScore) : 0;
      const passed = percentage >= (attempt.reviewPassingScore ?? question.assessment.passingScore);
      const result = await tx.assessmentAttempt.update({ where: { id: attempt.id }, data: {
        status: 'completed', score, percentage, passed,
      } });
      const policy = readAssessmentPolicy(attempt.assessment.policy).attemptPolicy;
      const context = longreadResultMetadataSchema.safeParse(attempt.longreadMetadata);
      await publishAssessmentResult(tx, result, result.id, result.courseId, question.assessment.title,
        policy && !attempt.longreadRevisionId ? async () => effectiveAssessmentResult(policy,
          await tx.assessmentAttempt.findMany({ where: completedAssessmentAttempts({
            organizationId: actor.organizationId, assessmentId: attempt.assessmentId, userId: attempt.userId,
            placementId: attempt.placementId, longreadRevisionId: null,
          }), orderBy: assessmentAttemptOrder, select: { id: true, percentage: true, passed: true } }),
          attempt.assessment.passingScore) : undefined,
        context.success ? `/learn/lessons/${context.data.lessonId}` : `/learn/attempts/${result.id}`);
      return { status: result.status };
    });
  }
}

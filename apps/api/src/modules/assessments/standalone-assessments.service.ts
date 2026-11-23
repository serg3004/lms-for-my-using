import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import { getSubtreeDepartmentIds } from '../departments/public.js';

const day = 86_400_000;
const jobName = 'assessments.assignment-reminders';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const assessmentLinkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const assignmentInput = z.object({
  target: z.enum(['user', 'group', 'department']),
  targetId: z.guid(),
  dueAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();

const liveStandalone = { deletedAt: null, status: 'published', courseId: null } as const;
const standaloneAttempt = { placementId: null, longreadRevisionId: null, deletedAt: null } as const;

@Injectable()
export class StandaloneAssessmentsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly jobs: BackgroundJobsService) {}

  onModuleInit() {
    this.jobs.registerHandler(jobName, async () => { await this.remind(); });
    this.jobs.registerRecurring(jobName, {}, {
      schedulerId: 'assessment-assignment-reminders-v1', everyMs: 15 * 60_000, attempts: 3, backoffMs: 1000,
    });
  }

  async assertAccess(assessmentId: string, organizationId: string, userId: string, token?: string, explicitStandalone = false, coursePlacement = false) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { courseId: true, status: true, standaloneTokenHash: true,
        standaloneAssignments: { where: { organizationId, userId }, select: { userId: true } } },
    });
    if (!explicitStandalone && token === undefined && (assessment?.courseId || (assessment && coursePlacement))) return;
    if (assessment?.courseId === null && assessment.status === 'published') {
      if (token !== undefined ? assessment.standaloneTokenHash === digest(token) : assessment.standaloneAssignments.length > 0) return;
    }
    throw new NotFoundException('Assessment not found');
  }

  async listMine(organizationId: string, userId: string) {
    const assessments = await this.prisma.assessment.findMany({
      where: {
        organizationId, deletedAt: null, status: 'published',
        OR: [
          { course: { deletedAt: null, status: 'published' } },
          { ...liveStandalone, standaloneAssignments: { some: { organizationId, userId } } },
        ],
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: {
        id: true, title: true, courseId: true, maxAttempts: true, passingScore: true,
        standaloneAssignments: { where: { organizationId, userId }, select: { dueAt: true } },
        _count: { select: { questions: { where: { deletedAt: null } } } },
        attempts: {
          where: { organizationId, userId, countsTowardResults: true, deletedAt: null },
          orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
          select: { id: true, courseId: true, longreadRevisionId: true, status: true, passed: true, percentage: true },
        },
      },
    });
    return assessments.map(({ id, title, courseId, maxAttempts, passingScore, standaloneAssignments, attempts: allAttempts, _count }) => {
      const attempts = allAttempts.filter((attempt) => attempt.courseId === courseId && (courseId !== null || attempt.longreadRevisionId === null));
      return {
        assessment: { id, title, courseId, maxAttempts, passingScore },
        dueAt: standaloneAssignments[0]?.dueAt ?? null,
        questionCount: _count.questions,
        attemptsUsed: attempts.length,
        lastCompletedAttemptId: attempts.find((attempt) => attempt.status === 'completed')?.id ?? null,
        bestPercentage: attempts.reduce<number | null>((best, attempt) =>
          attempt.status === 'completed' ? Math.max(best ?? 0, attempt.percentage) : best, null),
        completed: attempts.some((attempt) => attempt.passed),
      };
    }).sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  }

  async assign(assessmentId: string, organizationId: string, input: z.output<typeof assignmentInput>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const assessment = await tx.assessment.findFirst({
        where: { ...liveStandalone, id: assessmentId, organizationId }, select: { title: true },
      });
      if (!assessment) throw new NotFoundException('Assessment not found');
      const recipientWhere = await this.recipients(tx, organizationId, input);
      const users = await tx.user.findMany({
        where: { ...recipientWhere, organizationId, deletedAt: null, status: { in: ['active', 'invited'] } },
        select: { id: true },
      });
      if (input.target === 'user' && !users.length) throw new NotFoundException('Assignment target not found');
      const existing = await tx.assessmentAssignment.findMany({ where: { assessmentId, organizationId, userId: { in: users.map(({ id }) => id) } } });
      const previous = new Map(existing.map((row) => [row.userId, row.dueAt.getTime()]));
      const changed = users.filter(({ id }) => previous.get(id) !== input.dueAt.getTime());
      const newUsers = changed.filter(({ id }) => !previous.has(id));
      const updates = changed.filter(({ id }) => previous.has(id));
      if (newUsers.length) {
        await tx.assessmentAssignment.createMany({ data: newUsers.map(({ id }) => ({ organizationId, assessmentId, userId: id, dueAt: input.dueAt })) });
      }
      if (updates.length) {
        await tx.assessmentAssignment.updateMany({
          where: { assessmentId, organizationId, userId: { in: updates.map(({ id }) => id) } },
          data: { dueAt: input.dueAt, remindedAt: null },
        });
      }
      if (changed.length) {
        await tx.notification.createMany({
          data: changed.map(({ id }) => this.notification(organizationId, id, assessmentId, assessment.title, input.dueAt, 'assessment_assigned')),
        });
      }
      return { assigned: users.length, changed: changed.length };
    });
  }

  private async recipients(tx: Prisma.TransactionClient, organizationId: string, input: z.output<typeof assignmentInput>): Promise<Prisma.UserWhereInput> {
    if (input.target === 'user') return { id: input.targetId };
    if (input.target === 'group') {
      const group = await tx.group.findFirst({ where: { id: input.targetId, organizationId, deletedAt: null, status: 'active' }, select: { id: true } });
      if (!group) throw new NotFoundException('Assignment target not found');
      const members = await tx.groupMember.findMany({ where: { groupId: group.id, organizationId, deletedAt: null }, select: { userId: true } });
      return { id: { in: members.map(({ userId }) => userId) } };
    }
    const department = await tx.department.findFirst({ where: { id: input.targetId, organizationId, status: 'active' }, select: { id: true } });
    if (!department) throw new NotFoundException('Assignment target not found');
    const departments = await getSubtreeDepartmentIds(tx, [department.id], organizationId);
    const members = await tx.departmentMembership.findMany({
      where: { organizationId, departmentId: { in: departments }, effectiveTo: null, isPrimary: true }, select: { userId: true },
    });
    return { id: { in: members.map(({ userId }) => userId) } };
  }

  async setLink(assessmentId: string, organizationId: string, enable: boolean) {
    const token = enable ? randomBytes(32).toString('base64url') : null;
    const rows = await this.prisma.assessment.updateMany({
      where: { ...liveStandalone, id: assessmentId, organizationId },
      data: { standaloneTokenHash: token ? digest(token) : null },
    });
    if (!rows.count) throw new NotFoundException('Assessment not found');
    return { token };
  }

  async remind(now = new Date()) {
    const pending = await this.prisma.assessmentAssignment.findMany({
      where: { remindedAt: null, dueAt: { lte: new Date(now.getTime() + day), gte: now }, assessment: liveStandalone },
      orderBy: [{ dueAt: 'asc' }, { assessmentId: 'asc' }, { userId: 'asc' }],
      take: 200,
      include: { assessment: { select: { title: true } }, user: { select: { status: true, deletedAt: true } } },
    });
    for (const row of pending) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.assessmentAssignment.updateMany({
          where: { assessmentId: row.assessmentId, userId: row.userId, dueAt: row.dueAt, remindedAt: null, assessment: liveStandalone },
          data: { remindedAt: now },
        });
        if (!claimed.count || row.user.status !== 'active' || row.user.deletedAt) return;
        const passed = await tx.assessmentAttempt.findFirst({
          where: { ...standaloneAttempt, assessmentId: row.assessmentId, organizationId: row.organizationId, userId: row.userId, passed: true },
          select: { id: true },
        });
        if (!passed) {
          await tx.notification.create({
            data: this.notification(row.organizationId, row.userId, row.assessmentId, row.assessment.title, row.dueAt, 'assessment_due_soon'),
          });
        }
      });
    }
  }

  private notification(organizationId: string, userId: string, assessmentId: string, assessmentTitle: string, dueAt: Date, type: string) {
    return { organizationId, userId, type, data: { assessmentTitle, dueAt: dueAt.toISOString() }, link: `/learn/assessments/${assessmentId}/take` };
  }
}

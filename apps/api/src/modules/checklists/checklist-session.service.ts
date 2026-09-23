import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChecklistSession, ChecklistSessionEventType, ChecklistSessionStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { runSerializableWithRetry } from '../departments/public.js';
import type {
  ChecklistSessionQuery,
  CreateChecklistSessionInput,
  UpdateChecklistSessionInput,
} from './checklists.schemas.js';

export type ChecklistSessionAction = 'start' | 'pause' | 'resume' | 'complete' | 'cancel';

type Transition = {
  from: readonly ChecklistSessionStatus[];
  to: ChecklistSessionStatus;
  event: ChecklistSessionEventType;
};

// Lifecycle per docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md:
// scheduled -> in_progress -> paused -> in_progress -> completed, plus scheduled -> cancelled.
const TRANSITIONS: Record<ChecklistSessionAction, Transition> = {
  start: { from: ['scheduled'], to: 'in_progress', event: 'started' },
  pause: { from: ['in_progress'], to: 'paused', event: 'paused' },
  resume: { from: ['paused'], to: 'in_progress', event: 'resumed' },
  complete: { from: ['in_progress'], to: 'completed', event: 'completed' },
  cancel: { from: ['scheduled'], to: 'cancelled', event: 'cancelled' },
};

const STALE_WRITE_MESSAGE = 'Checklist session was modified by someone else — reload and try again';

export type ChecklistSessionView = ChecklistSession & { overdue: boolean };

function present(session: ChecklistSession): ChecklistSessionView {
  return {
    ...session,
    // A session is overdue once its scheduled time has passed without ever starting.
    overdue: session.status === 'scheduled' && session.scheduledAt !== null && session.scheduledAt < new Date(),
  };
}

@Injectable()
export class ChecklistSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreateChecklistSessionInput, actorId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: input.instanceId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        await this.assertValidObserver(tx, input.observerId, organizationId);

        const created = await tx.checklistSession.create({
          data: {
            organizationId,
            instanceId: input.instanceId,
            observerId: input.observerId,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
            locationCapturePolicy: input.locationCapturePolicy,
            timezone: input.timezone,
          },
        });

        await tx.checklistSessionEvent.create({
          data: { organizationId, sessionId: created.id, eventType: 'created', actorUserId: actorId },
        });

        return created;
      });

      return present(session);
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'instance_id')) {
        throw new ConflictException('This checklist assignment already has a session');
      }
      throw error;
    }
  }

  async list(organizationId: string, query: ChecklistSessionQuery, scope: object) {
    const overdueClause: Prisma.ChecklistSessionWhereInput =
      query.overdueOnly === 'true'
        ? { status: 'scheduled', scheduledAt: { lt: new Date() } }
        : query.overdueOnly === 'false'
          ? { OR: [{ status: { not: 'scheduled' } }, { scheduledAt: null }, { scheduledAt: { gte: new Date() } }] }
          : {};

    const where: Prisma.ChecklistSessionWhereInput = {
      organizationId,
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(query.observerId ? { observerId: query.observerId } : {}),
      ...overdueClause,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.checklistSession.findMany({
        where,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.checklistSession.count({ where }),
    ]);

    return { items: items.map(present), page: query.page, pageSize: query.pageSize, total };
  }

  async get(sessionId: string, organizationId: string, scope: object) {
    const session = await this.prisma.checklistSession.findFirst({ where: { id: sessionId, organizationId, ...scope } });
    if (!session) throw new NotFoundException('Checklist session not found');
    return present(session);
  }

  async listEvents(sessionId: string, organizationId: string, scope: object) {
    const exists = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Checklist session not found');
    return this.prisma.checklistSessionEvent.findMany({
      where: { sessionId, organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async update(sessionId: string, organizationId: string, input: UpdateChecklistSessionInput, actorId: string, scope: object) {
    const { version: expectedVersion, ...changes } = input;

    return runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.status !== 'scheduled') {
        throw new BadRequestException('Only a scheduled session can be updated or rescheduled');
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      if (changes.observerId) await this.assertValidObserver(tx, changes.observerId, organizationId);

      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: 'scheduled' },
        data: {
          ...(changes.observerId !== undefined ? { observerId: changes.observerId } : {}),
          ...(changes.scheduledAt !== undefined ? { scheduledAt: changes.scheduledAt ? new Date(changes.scheduledAt) : null } : {}),
          ...(changes.locationCapturePolicy !== undefined ? { locationCapturePolicy: changes.locationCapturePolicy } : {}),
          ...(changes.timezone !== undefined ? { timezone: changes.timezone } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      await tx.checklistSessionEvent.create({
        data: { organizationId, sessionId, eventType: 'rescheduled', actorUserId: actorId, metadata: changes as Prisma.InputJsonValue },
      });
      if (changes.observerId) {
        await tx.checklistSessionEvent.create({
          data: {
            organizationId,
            sessionId,
            eventType: 'observer_reassigned',
            actorUserId: actorId,
            metadata: { observerId: changes.observerId },
          },
        });
      }

      return present(await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } }));
    });
  }

  async transition(
    sessionId: string,
    organizationId: string,
    action: ChecklistSessionAction,
    expectedVersion: number,
    actorId: string,
    scope: object,
  ) {
    const { from, to, event } = TRANSITIONS[action];

    return runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (!from.includes(session.status)) {
        throw new BadRequestException(`Cannot ${action} a session in status "${session.status}"`);
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: { in: from as ChecklistSessionStatus[] } },
        data: {
          status: to,
          version: { increment: 1 },
          ...(action === 'start' ? { startedAt: new Date() } : {}),
          ...(action === 'pause' ? { pausedAt: new Date() } : {}),
          ...(action === 'resume' ? { pausedAt: null } : {}),
        },
      });
      // Belt-and-suspenders: under Serializable isolation a genuine race causes the losing
      // transaction to retry with a fresh read (via runSerializableWithRetry), which then hits
      // one of the checks above — but a count mismatch here is still caught rather than assumed.
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      await tx.checklistSessionEvent.create({ data: { organizationId, sessionId, eventType: event, actorUserId: actorId } });

      return present(await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } }));
    });
  }

  private async assertValidObserver(tx: Prisma.TransactionClient, observerId: string, organizationId: string) {
    // ADR_CHECKLIST_SESSION_OVERLAY.md: Observer = the existing `instructor` role, not `manager`.
    const observer = await tx.user.findFirst({
      where: {
        id: observerId,
        organizationId,
        deletedAt: null,
        memberships: { some: { role: 'instructor', organizationId } },
      },
      select: { id: true },
    });
    if (!observer) throw new BadRequestException('Observer must be a user with the instructor role');
  }

  private isUniqueConstraintViolation(error: unknown, columnHint: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002' &&
      JSON.stringify((error as { meta?: unknown }).meta ?? '').includes(columnHint)
    );
  }
}

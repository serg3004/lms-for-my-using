import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChecklistLocationCapturePoint,
  ChecklistScoreRevision,
  ChecklistSession,
  ChecklistSessionEventType,
  ChecklistSessionStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { runSerializableWithRetry } from '../departments/public.js';
import {
  createIncompleteAfterStartReminder,
  suppressPendingReminders,
  upsertPreStartReminder,
} from './checklist-session-reminders.js';
import { ACTIVE_ASSIGNMENT_CONFLICT_MESSAGE, ChecklistsService } from './checklists.service.js';
import type {
  BulkCreateChecklistSessionInput,
  ChecklistSessionParticipantsQuery,
  ChecklistSessionQuery,
  CreateChecklistSessionInput,
  SubmitChecklistLocationCaptureInput,
  SubmitChecklistSessionFeedbackInput,
  UpdateChecklistSessionInput,
} from './checklists.schemas.js';

const sessionProjectionInclude = {
  instance: {
    select: {
      id: true,
      checklistId: true,
      userId: true,
      status: true,
      percentage: true,
      passed: true,
      scored: true,
      checklist: { select: { id: true, title: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
  observer: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

type SessionWithProjection = Prisma.ChecklistSessionGetPayload<{ include: typeof sessionProjectionInclude }>;

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

/**
 * Admin API result projection (PR 292): the session list/detail views need learner/observer/
 * checklist identity and the underlying ChecklistInstance's result, not just the bare session
 * row -- joined here rather than duplicated onto ChecklistSession, since ChecklistInstance stays
 * the single source of truth for the submission's score (ADR_CHECKLIST_SESSION_OVERLAY.md).
 */
function presentProjected(session: SessionWithProjection) {
  const { instance, observer, ...rest } = session;
  return {
    ...present(rest as ChecklistSession),
    checklist: instance.checklist,
    learner: instance.user,
    observer,
    result: {
      instanceStatus: instance.status,
      percentage: instance.percentage,
      passed: instance.passed,
      scored: instance.scored,
      visible: true,
    },
  };
}

export type ChecklistSessionViewerContext = {
  isLearnerOnly: boolean;
  feedbackVisibility: 'after_completion' | 'live';
};

/**
 * PR 286 required "server-side enforcement" of `ChecklistWorkplaceSettings.feedbackVisibility`
 * but nothing ever consumed it -- PR 298 (the employee's own session view) is the first read path
 * that actually needs to decide what a learner sees before their session is complete, so this is
 * where the gap gets closed. Only ever masks for the learner themselves (`isLearnerOnly`) -- admin/
 * manager/instructor always see the real numbers/feedback regardless of this policy, since it's
 * specifically about hiding a result from the person being evaluated until it's meant to be shown.
 * `after_completion` masks the score AND the PR 297 structured feedback until
 * `result.instanceStatus === 'completed'`; `live` never masks anything. Numbers are nulled out
 * entirely (not just flagged) -- `result.visible` tells the caller why, but the actual percentage/
 * passed never reaches an unauthorized response body to be read from dev tools.
 */
function applyFeedbackVisibility<
  T extends {
    result: { instanceStatus: string; percentage: number | null; passed: boolean | null; scored: boolean | null; visible: boolean };
    strengths: string | null;
    developmentAreas: string | null;
    nextSteps: string | null;
  },
>(session: T, viewer: ChecklistSessionViewerContext): T {
  if (!viewer.isLearnerOnly || viewer.feedbackVisibility === 'live' || session.result.instanceStatus === 'completed') {
    return session;
  }
  return {
    ...session,
    result: { ...session.result, percentage: null, passed: null, scored: null, visible: false },
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
  };
}

@Injectable()
export class ChecklistSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checklistsService: ChecklistsService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  /**
   * PR 301: wrapped in a Serializable transaction (not a plain one) so the idempotency-key
   * check-then-write below is itself race-safe, same as every other lifecycle mutation. A retry
   * carrying the same `idempotencyKey` replays the first call's stored response instead of
   * relying solely on the instance-scoped unique constraint below, which only ever produces a
   * 409 -- not the original success payload -- on a second attempt.
   */
  async create(organizationId: string, input: CreateChecklistSessionInput, actorId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: input.instanceId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');

    try {
      return await runSerializableWithRetry(this.prisma, async (tx) => {
        const cached = await this.findIdempotentResponse<ChecklistSessionView>(tx, organizationId, 'session.create', input.idempotencyKey);
        if (cached) return cached;

        const session = await this.createSessionInTransaction(tx, {
          organizationId,
          instanceId: input.instanceId,
          observerId: input.observerId,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          locationCapturePolicy: input.locationCapturePolicy,
          timezone: input.timezone,
          actorId,
        });

        const presented = present(session);
        await this.recordIdempotentResponse(tx, organizationId, 'session.create', input.idempotencyKey, presented);
        return presented;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'instance_id')) {
        throw new ConflictException('This checklist assignment already has a session');
      }
      throw error;
    }
  }

  /**
   * Bulk create (PR 292): each recipient becomes an independent (ChecklistInstance,
   * ChecklistSession) pair -- one recipient's failure (e.g. already has an active assignment for
   * this checklist) never blocks the others, mirroring ChecklistsService.bulkAssignChecklist's
   * partial-success shape. `learnerScope` is the caller's effective-team scope (same as the
   * participant picker): a learnerId outside it is rejected here, not just hidden from the picker
   * UI -- a manager can't bypass the scoped picker by posting an arbitrary in-tenant learner id.
   * Each recipient's instance+session pair is created in one transaction so a session-creation
   * failure never leaves an orphaned active assignment behind.
   */
  async bulkCreate(organizationId: string, input: BulkCreateChecklistSessionInput, actorId: string, learnerScope: object) {
    await this.assertValidObserver(this.prisma, input.observerId, organizationId);

    const allowedLearners = await this.prisma.user.findMany({
      where: { organizationId, id: { in: input.learnerIds }, ...learnerScope },
      select: { id: true },
    });
    const allowedLearnerIds = new Set(allowedLearners.map((u) => u.id));

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const results: Array<{ learnerId: string; status: 'created' | 'skipped' | 'failed'; sessionId?: string; reason?: string }> = [];

    for (const learnerId of input.learnerIds) {
      if (!allowedLearnerIds.has(learnerId)) {
        results.push({ learnerId, status: 'failed', reason: 'Learner is outside your scope' });
        continue;
      }
      try {
        const session = await this.prisma.$transaction(async (tx) => {
          const instance = await this.checklistsService.assignChecklist(input.checklistId, organizationId, { userId: learnerId }, actorId, tx);
          return this.createSessionInTransaction(tx, {
            organizationId,
            instanceId: instance.id,
            observerId: input.observerId,
            scheduledAt,
            locationCapturePolicy: input.locationCapturePolicy,
            timezone: input.timezone,
            actorId,
          });
        });
        results.push({ learnerId, status: 'created', sessionId: session.id });
      } catch (error) {
        // Only the per-recipient active-assignment conflict is skippable -- any other
        // BadRequestException (e.g. "checklist is not published") is a request-level validation
        // failure that applies identically to every recipient and must abort the whole batch,
        // not be silently swallowed as a per-learner skip.
        if (error instanceof BadRequestException && error.message === ACTIVE_ASSIGNMENT_CONFLICT_MESSAGE) {
          results.push({ learnerId, status: 'skipped', reason: error.message });
        } else if (error instanceof NotFoundException) {
          results.push({ learnerId, status: 'failed', reason: error.message });
        } else {
          throw error;
        }
      }
    }

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_session.bulk_created',
      targetType: 'checklist',
      targetId: input.checklistId,
      summary: `Bulk-created checklist sessions for ${input.learnerIds.length} recipient(s)`,
      metadata: { created: results.filter((r) => r.status === 'created').length, total: input.learnerIds.length },
    });

    return {
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }

  /**
   * Repeat (PR 292): a ChecklistSession is a permanent 1:1 overlay over one ChecklistInstance
   * (unique instanceId), so "repeating" a session can never mean a second session on the same
   * instance -- it means a fresh assignment of the same checklist to the same learner, with a new
   * session over that new instance, copying the observer/geolocation/timezone config forward.
   * Only allowed from a terminal session: an active one should be updated in place instead.
   * Named `repeatSession` (not `repeat`) so it can't be mistaken for `String.prototype.repeat`
   * by taint-tracking static analysis over its `sessionId` argument.
   * The new instance+session pair is created in one transaction, so a session-creation failure
   * (e.g. the copied observer no longer holds the instructor role) rolls back the fresh
   * assignment too -- it never leaves an orphaned active assignment that would make every retry
   * fail with "already has an active assignment".
   */
  async repeatSession(sessionId: string, organizationId: string, actorId: string, scope: object) {
    const original = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      select: {
        status: true,
        observerId: true,
        locationCapturePolicy: true,
        timezone: true,
        instance: { select: { checklistId: true, userId: true } },
      },
    });
    if (!original) throw new NotFoundException('Checklist session not found');
    if (original.status !== 'completed' && original.status !== 'cancelled') {
      throw new BadRequestException('Only a completed or cancelled session can be repeated');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const instance = await this.checklistsService.assignChecklist(
        original.instance.checklistId,
        organizationId,
        { userId: original.instance.userId },
        actorId,
        tx,
      );
      return this.createSessionInTransaction(tx, {
        organizationId,
        instanceId: instance.id,
        observerId: original.observerId,
        scheduledAt: null,
        locationCapturePolicy: original.locationCapturePolicy,
        timezone: original.timezone,
        actorId,
      });
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_session.repeated',
      targetType: 'checklist_session',
      targetId: session.id,
      summary: 'Repeated checklist session as a new instance/session pair',
      metadata: { originalSessionId: sessionId },
    });

    return present(session);
  }

  /**
   * Participant lookup (PR 292): the admin "new session" wizard's employee/observer pickers.
   * `learner` is scoped the same way session visibility is (tenant-wide for admin, effective team
   * for manager) so a manager can't schedule a session for someone outside their team; `observer`
   * is any active user holding the `instructor` role, tenant-wide (observers aren't team-scoped).
   */
  async listParticipants(organizationId: string, query: ChecklistSessionParticipantsQuery, learnerScope: object) {
    const searchClause: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const where: Prisma.UserWhereInput = {
      organizationId,
      deletedAt: null,
      status: 'active',
      ...searchClause,
      ...(query.role === 'observer' ? { memberships: { some: { role: 'instructor', organizationId } } } : learnerScope),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, firstName: true, lastName: true, email: true, position: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async list(organizationId: string, query: ChecklistSessionQuery, scope: object, viewer: ChecklistSessionViewerContext) {
    const overdueClause: Prisma.ChecklistSessionWhereInput =
      query.overdueOnly === 'true'
        ? { status: 'scheduled', scheduledAt: { lt: new Date() } }
        : query.overdueOnly === 'false'
          ? { OR: [{ status: { not: 'scheduled' } }, { scheduledAt: null }, { scheduledAt: { gte: new Date() } }] }
          : {};
    const scheduledClause: Prisma.ChecklistSessionWhereInput =
      query.scheduledFrom || query.scheduledTo
        ? {
            scheduledAt: {
              ...(query.scheduledFrom ? { gte: new Date(query.scheduledFrom) } : {}),
              ...(query.scheduledTo ? { lte: new Date(query.scheduledTo) } : {}),
            },
          }
        : {};
    const searchClause: Prisma.ChecklistSessionWhereInput = query.search
      ? {
          OR: [
            { instance: { user: { OR: [{ firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }] } } },
            { instance: { checklist: { title: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {};

    // `scope` (from sessionScope()) may itself set a nested `instance: {...}` clause for a
    // manager's effective-team restriction -- a flat spread here would let a later `instance:`
    // key (checklistId/learnerId filters) silently *replace* rather than narrow it, letting a
    // manager read outside-team sessions by supplying either filter. Combine every clause under
    // `AND` instead so nested `instance`/`OR` keys from different clauses compose, not overwrite.
    const where: Prisma.ChecklistSessionWhereInput = {
      AND: [
        { organizationId },
        scope,
        query.status ? { status: query.status } : {},
        query.observerId ? { observerId: query.observerId } : {},
        query.checklistId ? { instance: { checklistId: query.checklistId } } : {},
        query.learnerId ? { instance: { userId: query.learnerId } } : {},
        overdueClause,
        scheduledClause,
        searchClause,
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.checklistSession.findMany({
        where,
        include: sessionProjectionInclude,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.checklistSession.count({ where }),
    ]);

    return {
      items: items.map((item) => applyFeedbackVisibility(presentProjected(item), viewer)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(sessionId: string, organizationId: string, scope: object, viewer: ChecklistSessionViewerContext) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      include: sessionProjectionInclude,
    });
    if (!session) throw new NotFoundException('Checklist session not found');
    return applyFeedbackVisibility(presentProjected(session), viewer);
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

      if (changes.scheduledAt !== undefined) {
        await upsertPreStartReminder(tx, {
          organizationId,
          sessionId,
          scheduledAt: changes.scheduledAt ? new Date(changes.scheduledAt) : null,
        });
      }

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

  /**
   * PR 301: `idempotencyKey`, when present, is checked before any version/status logic runs --
   * that ordering is what lets a genuine retry of "my own complete request" (same key, same
   * expectedVersion) succeed with the original response instead of a 409, while a truly
   * conflicting concurrent request (different key, or none) still gets STALE_WRITE_MESSAGE.
   */
  async transition(
    sessionId: string,
    organizationId: string,
    action: ChecklistSessionAction,
    expectedVersion: number,
    actorId: string,
    scope: object,
    idempotencyKey?: string,
  ) {
    const { from, to, event } = TRANSITIONS[action];
    const idempotencyScope = `session.transition:${action}`;

    return runSerializableWithRetry(this.prisma, async (tx) => {
      const cached = await this.findIdempotentResponse<ChecklistSessionView>(tx, organizationId, idempotencyScope, idempotencyKey);
      if (cached) return cached;

      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (!from.includes(session.status)) {
        throw new BadRequestException(`Cannot ${action} a session in status "${session.status}"`);
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      const now = new Date();
      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: { in: from as ChecklistSessionStatus[] } },
        data: {
          status: to,
          version: { increment: 1 },
          ...(action === 'start' ? { startedAt: now } : {}),
          ...(action === 'pause' ? { pausedAt: now } : {}),
          ...(action === 'resume' ? { pausedAt: null } : {}),
        },
      });
      // Belt-and-suspenders: under Serializable isolation a genuine race causes the losing
      // transaction to retry with a fresh read (via runSerializableWithRetry), which then hits
      // one of the checks above — but a count mismatch here is still caught rather than assumed.
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      if (action === 'start') {
        await createIncompleteAfterStartReminder(tx, { organizationId, sessionId, startedAt: now });
      }
      if (action === 'complete' || action === 'cancel') {
        // A terminal session must never leave a pending reminder behind for the worker to find.
        await suppressPendingReminders(tx, { organizationId, sessionId });
      }

      await tx.checklistSessionEvent.create({ data: { organizationId, sessionId, eventType: event, actorUserId: actorId } });

      const presented = present(await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } }));
      await this.recordIdempotentResponse(tx, organizationId, idempotencyScope, idempotencyKey, presented);
      return presented;
    });
  }

  /**
   * Structured feedback (PR 297): the observer records strengths/development areas/next steps
   * during or right after the session. Only meaningful once the session has actually started --
   * a `scheduled` session has nothing to give feedback on yet, and a `cancelled` one never will --
   * so this reuses the same "started" gate as item results, just expressed directly against
   * status rather than TRANSITIONS (there's no session-status transition involved here).
   * Same optimistic-concurrency contract (version, 409 on stale write) as update()/transition().
   */
  async submitFeedback(sessionId: string, organizationId: string, input: SubmitChecklistSessionFeedbackInput, actorId: string, scope: object) {
    const { version: expectedVersion, ...changes } = input;

    return runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.status === 'scheduled' || session.status === 'cancelled') {
        throw new BadRequestException(`Cannot record feedback for a session in status "${session.status}"`);
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion },
        data: {
          ...(changes.strengths !== undefined ? { strengths: changes.strengths } : {}),
          ...(changes.developmentAreas !== undefined ? { developmentAreas: changes.developmentAreas } : {}),
          ...(changes.nextSteps !== undefined ? { nextSteps: changes.nextSteps } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      await tx.checklistSessionEvent.create({
        data: { organizationId, sessionId, eventType: 'feedback_updated', actorUserId: actorId },
      });

      return present(await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } }));
    });
  }

  /**
   * Geolocation capture (PR 290): at most one report per (session, capturePoint) -- enforced by
   * the unique constraint added in PR 288, so a second submission for the same point is a 409,
   * never a silent overwrite. "getCurrentPosition once, never watchPosition" is a client-side
   * constraint; this is the server-observable half of "start/end only, no continuous tracking."
   * When the caller is not the assigned observer (only reachable by an admin, since the RBAC
   * policy + sessionScope() together restrict everyone else), an `overrideReason` is required
   * and the submission is separately audited via a `location_override` ChecklistSessionEvent.
   */
  async captureLocation(
    sessionId: string,
    organizationId: string,
    capturePoint: ChecklistLocationCapturePoint,
    input: SubmitChecklistLocationCaptureInput,
    actorId: string,
    scope: object,
  ) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      select: { id: true, observerId: true, locationCapturePolicy: true },
    });
    if (!session) throw new NotFoundException('Checklist session not found');
    if (session.locationCapturePolicy === 'off') {
      throw new BadRequestException('Geolocation capture is disabled for this session');
    }

    const isOverride = session.observerId !== actorId;
    if (isOverride && !input.overrideReason) {
      throw new BadRequestException('overrideReason is required when submitting a location capture on behalf of the observer');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const capture = await tx.checklistLocationCapture.create({
          data: {
            organizationId,
            sessionId,
            capturePoint,
            status: input.status,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMeters: input.accuracyMeters,
            capturedBy: actorId,
          },
        });

        if (isOverride) {
          await tx.checklistSessionEvent.create({
            data: {
              organizationId,
              sessionId,
              eventType: 'location_override',
              actorUserId: actorId,
              metadata: { capturePoint, status: input.status, overrideReason: input.overrideReason },
            },
          });
        }

        return capture;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'capture_point')) {
        throw new ConflictException(`A ${capturePoint} location capture already exists for this session`);
      }
      throw error;
    }
  }

  /**
   * Privacy-safe projection: only the assigned observer (who submitted the capture) and admin
   * see raw coordinates. Everyone else with read access to the session (manager, learner) sees
   * only that a capture happened, not where.
   */
  async listLocationCaptures(sessionId: string, organizationId: string, scope: object, actorId: string, isAdmin: boolean) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      select: { id: true, observerId: true },
    });
    if (!session) throw new NotFoundException('Checklist session not found');

    const canSeeCoordinates = isAdmin || session.observerId === actorId;
    const captures = await this.prisma.checklistLocationCapture.findMany({
      where: { sessionId, organizationId },
      orderBy: { capturePoint: 'asc' },
    });

    if (canSeeCoordinates) return captures;
    return captures.map(({ id, organizationId: orgId, sessionId: sid, capturePoint, status, capturedBy, capturedAt }) => ({
      id,
      organizationId: orgId,
      sessionId: sid,
      capturePoint,
      status,
      capturedBy,
      capturedAt,
    }));
  }

  /**
   * PR 300 — admin-only recalculate: re-derives the score purely from persisted
   * `ChecklistItemResult` rows + the immutable template snapshot (`ChecklistsService.
   * computeInstanceScore`), never touching status or results. Always records a
   * `ChecklistScoreRevision` -- even a no-op recalculation is a meaningful audit event ("an admin
   * explicitly re-checked this score") -- inside a Serializable transaction with retry so a
   * concurrent item-result submission can't race the recalculation into a stale write.
   *
   * PR 301: unlike the lifecycle transitions, recalculate has no version/status guard at all
   * (deliberately -- PR 300 wants every explicit re-check recorded, no-op or not), so without an
   * idempotency key a bare network retry of the same request would write a second, spurious
   * revision. `idempotencyKey` is checked first and, on a hit, replays the first call's revision
   * without touching the audit log a second time.
   */
  async recalculateScore(sessionId: string, organizationId: string, reason: string, actorId: string, scope: object, idempotencyKey?: string) {
    const idempotencyScope = 'session.recalculate';
    const { revision, previousPercentage, newPercentage, replayed } = await runSerializableWithRetry(this.prisma, async (tx) => {
      const cached = await this.findIdempotentResponse<ChecklistScoreRevision>(tx, organizationId, idempotencyScope, idempotencyKey);
      if (cached) {
        return { revision: cached, previousPercentage: cached.previousPercentage, newPercentage: cached.newPercentage, replayed: true };
      }

      const session = await tx.checklistSession.findFirst({
        where: { id: sessionId, organizationId, ...scope },
        select: {
          id: true,
          instanceId: true,
          instance: { select: { status: true, percentage: true, passed: true } },
        },
      });
      if (!session) throw new NotFoundException('Checklist session not found');

      const { totalScore, maxScore, scored, percentage, passThreshold } = await this.checklistsService.computeInstanceScore(
        session.instanceId,
        organizationId,
        tx,
      );
      const passed = scored && session.instance.status === 'completed' && percentage >= passThreshold;

      const createdRevision = await tx.checklistScoreRevision.create({
        data: {
          organizationId,
          instanceId: session.instanceId,
          previousPercentage: session.instance.percentage,
          newPercentage: percentage,
          previousPassed: session.instance.passed,
          newPassed: passed,
          reason,
          actorUserId: actorId,
        },
      });

      await tx.checklistInstance.update({
        where: { id: session.instanceId },
        data: { totalScore, maxScore, percentage, passed, scored },
      });

      await tx.checklistSessionEvent.create({
        data: {
          organizationId,
          sessionId,
          eventType: 'score_recalculated',
          actorUserId: actorId,
          metadata: { revisionId: createdRevision.id, previousPercentage: session.instance.percentage, newPercentage: percentage },
        },
      });

      await this.recordIdempotentResponse(tx, organizationId, idempotencyScope, idempotencyKey, createdRevision);

      return { revision: createdRevision, previousPercentage: session.instance.percentage, newPercentage: percentage, replayed: false };
    });

    // A replayed retry didn't mutate anything the first call hadn't already audited -- recording
    // a second audit-log entry for it would misrepresent the timeline as two recalculations.
    if (!replayed) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'checklist_score_revision.created',
        targetType: 'checklist_instance',
        targetId: revision.instanceId,
        summary: `Recalculated checklist score (${previousPercentage}% -> ${newPercentage}%)`,
        metadata: { sessionId, reason },
      });
    }

    return revision;
  }

  async listScoreRevisions(sessionId: string, organizationId: string, scope: object) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, ...scope },
      select: { instanceId: true },
    });
    if (!session) throw new NotFoundException('Checklist session not found');
    return this.prisma.checklistScoreRevision.findMany({
      where: { instanceId: session.instanceId, organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Shared by create/bulkCreate/repeat: create the session row + `created` event + pre_start reminder. */
  private async createSessionInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      instanceId: string;
      observerId: string;
      scheduledAt: Date | null;
      locationCapturePolicy?: CreateChecklistSessionInput['locationCapturePolicy'];
      timezone?: string;
      actorId: string;
    },
  ) {
    await this.assertValidObserver(tx, input.observerId, input.organizationId);

    const created = await tx.checklistSession.create({
      data: {
        organizationId: input.organizationId,
        instanceId: input.instanceId,
        observerId: input.observerId,
        scheduledAt: input.scheduledAt ?? undefined,
        locationCapturePolicy: input.locationCapturePolicy,
        timezone: input.timezone,
      },
    });

    await tx.checklistSessionEvent.create({
      data: { organizationId: input.organizationId, sessionId: created.id, eventType: 'created', actorUserId: input.actorId },
    });

    if (created.scheduledAt) {
      await upsertPreStartReminder(tx, { organizationId: input.organizationId, sessionId: created.id, scheduledAt: created.scheduledAt });
    }

    return created;
  }

  /**
   * PR 301: the shared idempotency-key read half. `scope` distinguishes which endpoint the key
   * belongs to (`session.create`, `session.transition:<action>`, `session.recalculate`) so the
   * same client-chosen key string can never accidentally collide across unrelated operations --
   * the (organizationId, scope, key) tuple is what the unique constraint on
   * ChecklistIdempotencyKey actually enforces. Returns undefined (never throws) when no key was
   * supplied -- the caller always proceeds with a fresh mutation in that case.
   */
  private async findIdempotentResponse<T>(
    tx: Prisma.TransactionClient,
    organizationId: string,
    scope: string,
    key: string | undefined,
  ): Promise<T | undefined> {
    if (!key) return undefined;
    const existing = await tx.checklistIdempotencyKey.findUnique({
      where: { organizationId_scope_key: { organizationId, scope, key } },
    });
    return existing ? (existing.responseBody as T) : undefined;
  }

  /** The write half of the pair above -- a no-op when the caller supplied no key. */
  private async recordIdempotentResponse(
    tx: Prisma.TransactionClient,
    organizationId: string,
    scope: string,
    key: string | undefined,
    responseBody: unknown,
  ): Promise<void> {
    if (!key) return;
    await tx.checklistIdempotencyKey.create({
      data: { organizationId, scope, key, responseBody: responseBody as Prisma.InputJsonValue },
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

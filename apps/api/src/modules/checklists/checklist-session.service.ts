import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
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
import { exportLocale, MAX_EXPORT_ROWS, serializeReportCsv, sessionExportRows } from './checklist-report-csv.js';
import { runSerializableWithRetry } from '../departments/public.js';
import {
  createIncompleteAfterStartReminder,
  suppressPendingReminders,
  upsertPreStartReminder,
} from './checklist-session-reminders.js';
import { CHECKLIST_SESSION_MESSAGE_NOTIFY_JOB, SESSION_MESSAGE_LIMIT, SESSION_MESSAGE_WINDOW_MS } from './checklist-session-message.js';
import { eligibleObserverScope } from './checklist-observer-eligibility.js';
import { notifySessionChange } from './checklist-session-notifications.js';
import { ACTIVE_ASSIGNMENT_CONFLICT_MESSAGE, ChecklistsService } from './checklists.service.js';
import type {
  BulkCreateChecklistSessionInput,
  ChecklistSessionParticipantsQuery,
  ChecklistScoreFormula,
  ChecklistSessionQuery,
  CreateChecklistSessionInput,
  ContextField,
  SubmitChecklistLocationCaptureInput,
  SubmitChecklistSessionContextInput,
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

function parseContextFields(value: Prisma.JsonValue | null): ContextField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is ContextField => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return false;
    const candidate = field as Record<string, unknown>;
    return typeof candidate.id === 'string' && typeof candidate.label === 'string' &&
      (candidate.type === 'text' || candidate.type === 'textarea' || candidate.type === 'date') &&
      typeof candidate.required === 'boolean' && typeof candidate.order === 'number';
  });
}

function parseContextValues(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function contextFieldsFromSessionStart(session: {
  instance?: { templateSnapshot: Prisma.JsonValue | null; checklist: { contextFields: Prisma.JsonValue | null } };
}): ContextField[] {
  const snapshot = session.instance?.templateSnapshot;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const checklist = (snapshot as Record<string, unknown>).checklist;
    if (checklist && typeof checklist === 'object' && !Array.isArray(checklist)) {
      return parseContextFields((checklist as Record<string, Prisma.JsonValue>).contextFields ?? null);
    }
  }
  return parseContextFields(session.instance?.checklist.contextFields ?? null);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

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
  observerId?: string;
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
    observerId?: string;
    result: { instanceStatus: string; percentage: number | null; passed: boolean | null; scored: boolean | null; visible: boolean };
    strengths: string | null;
    developmentAreas: string | null;
    nextSteps: string | null;
    contextValues: Prisma.JsonValue | null;
  },
>(session: T, viewer: ChecklistSessionViewerContext): T {
  const isObserver = viewer.observerId !== undefined && session.observerId === viewer.observerId;
  if (isObserver || !viewer.isLearnerOnly || viewer.feedbackVisibility === 'live' || session.result.instanceStatus === 'completed') {
    return session;
  }
  return {
    ...session,
    result: { ...session.result, percentage: null, passed: null, scored: null, visible: false },
    strengths: null,
    developmentAreas: null,
    nextSteps: null,
    contextValues: null,
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
  async create(organizationId: string, input: CreateChecklistSessionInput, actorId: string, learnerScope: Prisma.UserWhereInput = {}) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: input.instanceId, organizationId, deletedAt: null, user: { organizationId, deletedAt: null, status: 'active', AND: [learnerScope] } },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');

    try {
      const { session: result, created } = await runSerializableWithRetry(this.prisma, async (tx) => {
        const cached = await this.findIdempotentResponse<ChecklistSessionView>(tx, organizationId, 'session.create', input.idempotencyKey);
        if (cached) {
          if (cached.instanceId !== input.instanceId || cached.observerId !== input.observerId) {
            throw new ConflictException('Idempotency key belongs to another session creation');
          }
          return { session: cached, created: false };
        }

        const session = await this.createSessionInTransaction(tx, {
          organizationId,
          instanceId: input.instanceId,
          observerId: input.observerId,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          durationMinutes: input.durationMinutes,
          locationCapturePolicy: input.locationCapturePolicy,
          timezone: input.timezone,
          actorId,
        });

        const presented = present(session);
        await this.recordIdempotentResponse(tx, organizationId, 'session.create', input.idempotencyKey, presented);
        return { session: presented, created: true };
      });
      if (created) {
        await this.auditLog.record({ organizationId, actorId, action: 'checklist_session.created',
          targetType: 'checklist_session', targetId: result.id, summary: 'Created checklist session',
          metadata: { instanceId: input.instanceId, observerId: input.observerId } });
      }
      return result;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'instance_id')) {
        // PostgreSQL can report a unique violation instead of a serialization failure when
        // identical creations race. The winner committed its response in the same transaction.
        // Replay only that exact creation; unrelated keys/observers retain the normal 409.
        const cached = await this.findIdempotentResponse<ChecklistSessionView>(this.prisma, organizationId, 'session.create', input.idempotencyKey);
        if (cached?.instanceId === input.instanceId && cached.observerId === input.observerId) return cached;
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
  async bulkCreate(organizationId: string, input: BulkCreateChecklistSessionInput, actorId: string, learnerScope: Prisma.UserWhereInput, requireAllLearnersInScope = false) {
    await this.assertValidObserver(this.prisma, input.observerId, organizationId);
    if (input.learnerIds.some((id) => id.toLowerCase() === input.observerId.toLowerCase())) {
      throw new BadRequestException('An employee cannot observe their own session');
    }
    if (requireAllLearnersInScope && !await this.prisma.checklist.findFirst({
      where: { id: input.checklistId, organizationId, deletedAt: null }, select: { id: true },
    })) {
      throw new NotFoundException('Checklist not found');
    }

    const allowedLearners = await this.prisma.user.findMany({
      where: { organizationId, id: { in: input.learnerIds }, deletedAt: null, status: 'active', AND: [learnerScope] },
      select: { id: true },
    });
    const allowedLearnerIds = new Set(allowedLearners.map((u) => u.id));

    // Own-create requests must not create a partial batch when any UUID is inaccessible.
    if (requireAllLearnersInScope && input.learnerIds.some((id) => !allowedLearnerIds.has(id))) {
      throw new NotFoundException('Learner not found');
    }

    const schedules = new Map(input.schedules?.map((schedule) => [schedule.learnerId, schedule]));
    const results: Array<{ learnerId: string; status: 'created' | 'skipped' | 'failed'; sessionId?: string; reason?: string }> = [];

    // Only advance this set after a recipient transaction commits: a Serializable retry must
    // never remember notifications whose transaction rolled back. The observer gets one notice
    // for the batch, anchored to its first successfully created session and linking to the list.
    const alreadyNotified = new Set<string>();
    for (const learnerId of input.learnerIds) {
      if (!allowedLearnerIds.has(learnerId)) {
        results.push({ learnerId, status: 'failed', reason: 'Learner is outside your scope' });
        continue;
      }
      try {
        const schedule = schedules.get(learnerId);
        const scheduledAt = schedule?.scheduledAt ?? input.scheduledAt;
        // Retry each atomic assignment/session pair independently. Concurrent retries must
        // observe the winning active assignment rather than create a second one.
        const session = await runSerializableWithRetry(this.prisma, async (tx) => {
          const instance = await this.checklistsService.assignChecklist(input.checklistId, organizationId, { userId: learnerId }, actorId, tx);
          return this.createSessionInTransaction(tx, {
            organizationId,
            instanceId: instance.id,
            observerId: input.observerId,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            durationMinutes: schedule?.durationMinutes !== undefined ? schedule.durationMinutes : input.durationMinutes,
            locationCapturePolicy: input.locationCapturePolicy,
            timezone: schedule?.timezone ?? input.timezone,
            actorId,
          }, { bulk: true, alreadyNotified });
        });
        alreadyNotified.add(learnerId);
        alreadyNotified.add(input.observerId);
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
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
      select: {
        status: true,
        observerId: true,
        locationCapturePolicy: true,
        durationMinutes: true,
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
        durationMinutes: original.durationMinutes,
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
   * follows the tenant eligibility setting, independently of the learner team scope.
   */
  async listParticipants(organizationId: string, query: ChecklistSessionParticipantsQuery, learnerScope: object, ownObserverId?: string) {
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
      AND: [searchClause, query.role === 'observer'
        ? { AND: [await eligibleObserverScope(this.prisma, organizationId), ...(ownObserverId ? [{ id: ownObserverId }] : [])] }
        : learnerScope],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, firstName: true, lastName: true, email: true, position: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  private buildListWhere(organizationId: string, query: ChecklistSessionQuery, scope: object): Prisma.ChecklistSessionWhereInput {
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
    return {
      AND: [
        { organizationId, deletedAt: null },
        scope,
        query.status ? { status: query.status } : {},
        query.excludeSessionId ? { id: { not: query.excludeSessionId } } : {},
        query.observerId ? { observerId: query.observerId } : {},
        query.checklistId ? { instance: { checklistId: query.checklistId } } : {},
        query.learnerId ? { instance: { userId: query.learnerId } } : {},
        query.departmentId
          ? { instance: { user: { departmentMemberships: { some: { organizationId, departmentId: query.departmentId, isPrimary: true, effectiveTo: null } } } } }
          : {},
        overdueClause,
        scheduledClause,
        searchClause,
      ],
    };
  }

  async list(organizationId: string, query: ChecklistSessionQuery, scope: object, viewer: ChecklistSessionViewerContext) {
    const where = this.buildListWhere(organizationId, query, scope);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.checklistSession.findMany({
        where,
        include: sessionProjectionInclude,
        orderBy: query.sort === 'recent' ? [{ startedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }] : [{ scheduledAt: 'asc' }, { id: 'asc' }],
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

  /**
   * PR 336: CSV of the sessions the caller's own list shows for these filters (same `where`, same
   * scope), capped so a runaway export cannot exhaust memory. The export is audited with the filters
   * and the row count, never with the rows themselves.
   */
  async exportCsv(organizationId: string, query: ChecklistSessionQuery, scope: object, actor: { id: string; locale: string | null }) {
    const where = this.buildListWhere(organizationId, query, scope);
    const items = await this.prisma.checklistSession.findMany({
      where,
      include: sessionProjectionInclude,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: MAX_EXPORT_ROWS + 1,
    });
    if (items.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException(`The export is limited to ${MAX_EXPORT_ROWS} sessions. Narrow the filters.`);
    }
    const table = sessionExportRows(items.map(presentProjected), exportLocale(actor.locale));
    const format = query.format ?? 'csv';
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist_report.exported',
      targetType: 'checklist_report',
      summary: `Exported ${items.length} checklist sessions to ${format.toUpperCase()}`,
      metadata: { kind: 'sessions', format, rowCount: items.length, filters: { ...query, format: undefined, page: undefined, pageSize: undefined } },
    });
    return { filename: `checklist-sessions-${new Date().toISOString().slice(0, 10)}.csv`, csv: serializeReportCsv(table), rows: table, rowCount: items.length };
  }

  async get(sessionId: string, organizationId: string, scope: object, viewer: ChecklistSessionViewerContext) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
      include: sessionProjectionInclude,
    });
    if (!session) throw new NotFoundException('Checklist session not found');
    return applyFeedbackVisibility(presentProjected(session), viewer);
  }

  async listEvents(sessionId: string, organizationId: string, scope: object) {
    const exists = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
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
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, deletedAt: null, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.status !== 'scheduled') {
        throw new BadRequestException('Only a scheduled session can be updated or rescheduled');
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      if (changes.observerId) {
        // Review fix (PR 302): reassigning to the *same* observer is never a real reassignment --
        // without this check it would still silently clear an unavailability report (and record a
        // no-op "observer_reassigned" event) even though nothing actually changed, letting an
        // admin dismiss a valid report without ever picking a replacement.
        if (changes.observerId.toLowerCase() === session.observerId.toLowerCase()) {
          throw new BadRequestException('The new observer must be different from the current one');
        }
        await this.assertValidObserver(tx, changes.observerId, organizationId);
        const employee = await tx.checklistInstance.findFirst({ where: { id: session.instanceId, organizationId, deletedAt: null }, select: { userId: true } });
        if (!employee) throw new NotFoundException('Checklist assignment not found');
        if (employee.userId.toLowerCase() === changes.observerId.toLowerCase()) throw new BadRequestException('An employee cannot observe their own session');
      }

      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: 'scheduled' },
        data: {
          ...(changes.observerId !== undefined
            ? // PR 302: a fresh observer is presumed available -- reassigning clears whatever
              // unavailability the *previous* observer reported, so the "Заменить наблюдателя" CTA
              // disappears the moment it's acted on rather than lingering against the new observer.
              { observerId: changes.observerId, observerUnavailableReason: null, observerUnavailableAt: null }
            : {}),
          ...(changes.scheduledAt !== undefined ? { scheduledAt: changes.scheduledAt ? new Date(changes.scheduledAt) : null } : {}),
          ...(changes.durationMinutes !== undefined ? { durationMinutes: changes.durationMinutes } : {}),
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

      const updated = await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } });
      const scheduleChanged = changes.scheduledAt !== undefined &&
        (session.scheduledAt?.getTime() ?? null) !== (changes.scheduledAt ? new Date(changes.scheduledAt).getTime() : null);
      const durationChanged = changes.durationMinutes !== undefined && changes.durationMinutes !== session.durationMinutes;
      const timezoneChanged = changes.timezone !== undefined && changes.timezone !== session.timezone;
      if (scheduleChanged || durationChanged || timezoneChanged || changes.observerId) {
        await notifySessionChange(tx, updated, 'checklist_session_rescheduled', { previousObserverId: changes.observerId ? session.observerId : undefined });
      }
      return present(updated);
    });
  }

  /**
   * PR 333: soft-deletes a session that has not started. Started/completed/cancelled sessions are
   * never deleted (400) -- their results and lifecycle history are the record. The row, its events
   * and the audit entry stay (append-only); only `deletedAt` is set, and the untouched paired
   * assignment is soft-deleted in the same transaction so the employee is not left with an orphan
   * assignment. Pending reminders are suppressed so nothing fires for a deleted session.
   */
  async deleteSession(sessionId: string, organizationId: string, actorId: string, scope: object) {
    await runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({
        where: { id: sessionId, organizationId, deletedAt: null, ...scope },
        select: { id: true, status: true, instanceId: true, observerId: true },
      });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.status !== 'scheduled') {
        throw new BadRequestException('Only a session that has not started can be deleted');
      }

      const now = new Date();
      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, status: 'scheduled', deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      await tx.checklistInstance.updateMany({
        where: { id: session.instanceId, organizationId, status: 'assigned', deletedAt: null },
        data: { deletedAt: now },
      });
      await suppressPendingReminders(tx, { organizationId, sessionId });
      await tx.checklistSessionEvent.create({ data: { organizationId, sessionId, eventType: 'deleted', actorUserId: actorId } });
      await notifySessionChange(tx, { ...session, organizationId }, 'checklist_session_deleted');
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_session.deleted',
      targetType: 'checklist_session',
      targetId: sessionId,
      summary: 'Deleted checklist session',
    });
  }

  /**
   * PR 333: "Write to the participant" -- an in-app Notification for the employee plus an outbox
   * event for best-effort email, both in one transaction. The notification carries only the
   * checklist title and the manager's text: never the observer's location captures, scores or
   * feedback. Capped per session so the button cannot be used to spam an employee.
   */
  async sendMessageToParticipant(sessionId: string, organizationId: string, message: string, actorId: string, scope: object) {
    const sent = await runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({
        where: { id: sessionId, organizationId, deletedAt: null, ...scope },
        select: { id: true, status: true, instance: { select: { userId: true, checklist: { select: { title: true } } } } },
      });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.status === 'completed' || session.status === 'cancelled') {
        throw new BadRequestException('A message cannot be sent about a completed or cancelled session');
      }

      const recent = await tx.checklistSessionEvent.count({
        where: { organizationId, sessionId, eventType: 'message_sent', createdAt: { gte: new Date(Date.now() - SESSION_MESSAGE_WINDOW_MS) } },
      });
      if (recent >= SESSION_MESSAGE_LIMIT) {
        throw new HttpException('Too many messages for this session, try again later', HttpStatus.TOO_MANY_REQUESTS);
      }

      const recipientId = session.instance.userId;
      const notification = await tx.notification.create({
        data: {
          organizationId,
          userId: recipientId,
          type: 'checklist_session_message',
          data: { sessionId, checklistTitle: session.instance.checklist.title, message },
          link: '/learn/checklists',
        },
      });
      await tx.checklistSessionEvent.create({
        data: { organizationId, sessionId, eventType: 'message_sent', actorUserId: actorId, metadata: { notificationId: notification.id } },
      });
      await tx.outboxEvent.create({
        data: {
          topic: CHECKLIST_SESSION_MESSAGE_NOTIFY_JOB,
          payload: { notificationId: notification.id, organizationId, sessionId, recipientId, checklistTitle: session.instance.checklist.title, message },
        },
      });
      return { notificationId: notification.id, recipientId };
    });
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_session.message_sent',
      targetType: 'checklist_session',
      targetId: sessionId,
      summary: 'Sent a message to the session participant',
      metadata: { recipientId: sent.recipientId },
    });
    return { sent: true as const };
  }

  /**
   * PR 352: the assigned observer (any system role, via `checklistSessionsRunOwn`) reports
   * they can't conduct this session. An orthogonal business flag, not a lifecycle transition -- it
   * never touches `status` and so never blocks start/pause/resume/complete/cancel; it only surfaces
   * a "Заменить наблюдателя" CTA (`PATCH .../checklist-sessions/:id` with a new `observerId`,
   * `checklistSessionsManage`: admin/manager, already object-scoped via `sessionScope()`) for
   * whoever can reassign. Restricted to a still-`scheduled` session for the same reason reassignment
   * itself is (ADR: participants are frozen once a session starts, so there's nothing to reassign
   * after that point). Notifies every org admin -- computing "which managers have this learner in
   * their effective team" would need a reverse walk over ManagerGroup/DepartmentManager that
   * OrganizationAccessScopeService doesn't expose today; an honest, scoped choice rather than an
   * unreliable one (admin can always reassign regardless of team scope).
   */
  async markObserverUnavailable(sessionId: string, organizationId: string, reason: string, expectedVersion: number, actorId: string, scope: object) {
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, deletedAt: null, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.observerId !== actorId) throw new NotFoundException('Checklist session not found');
      if (session.status !== 'scheduled') {
        throw new BadRequestException('Only a scheduled session\'s observer can be marked unavailable');
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      const now = new Date();
      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: 'scheduled' },
        data: { observerUnavailableReason: reason, observerUnavailableAt: now, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);

      await tx.checklistSessionEvent.create({
        data: { organizationId, sessionId, eventType: 'observer_marked_unavailable', actorUserId: actorId, metadata: { reason } },
      });

      const admins = await tx.membership.findMany({ where: { organizationId, role: 'admin' }, select: { userId: true } });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            organizationId,
            userId: admin.userId,
            type: 'checklist_session_observer_unavailable',
            data: { sessionId, reason },
            link: `/admin/checklists/sessions/${sessionId}`,
          })),
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
      const session = await tx.checklistSession.findFirst({
        where: { id: sessionId, organizationId, deletedAt: null, ...scope },
        include: { instance: { select: { templateSnapshot: true, checklist: { select: { contextFields: true } } } } },
      });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.observerId !== actorId && action !== 'cancel') throw new NotFoundException('Checklist session not found');
      // A replay still requires current object access. An operation key cannot identify another
      // session, even when the caller may conduct both of them.
      if (cached) {
        if (cached.id !== sessionId) throw new ConflictException('Idempotency key belongs to another session transition');
        return cached;
      }
      if (!from.includes(session.status)) {
        throw new BadRequestException(`Cannot ${action} a session in status "${session.status}"`);
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      if (action === 'complete') {
        const fields = parseContextFields(session.contextFieldsSnapshot);
        const values = parseContextValues(session.contextValues);
        const missing = fields.find((field) => field.required && !values[field.id]?.trim());
        if (missing) throw new BadRequestException(`Required context field is missing: ${missing.label}`);
      }

      // PR 330: on a checklist that allows finishing incomplete, unanswered criteria are recorded as
      // skipped before the session closes. It runs after every check above that can still reject the
      // request, so a refused completion never skips anything; recording a skip is idempotent.
      if (action === 'complete') {
        await this.checklistsService.finishIncompleteInstance(session.instanceId, organizationId);
      }

      const contextFieldsSnapshot = action === 'start' ? contextFieldsFromSessionStart(session) : undefined;

      const now = new Date();
      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: { in: from as ChecklistSessionStatus[] } },
        data: {
          status: to,
          version: { increment: 1 },
          ...(action === 'start' ? { startedAt: now } : {}),
          ...(action === 'pause' ? { pausedAt: now } : {}),
          ...(action === 'resume' ? { pausedAt: null } : {}),
          ...(contextFieldsSnapshot !== undefined
            ? { contextFieldsSnapshot: contextFieldsSnapshot as unknown as Prisma.InputJsonValue }
            : {}),
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

      if (action === 'complete') await notifySessionChange(tx, session, 'checklist_session_completed');

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
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, deletedAt: null, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.observerId !== actorId) throw new NotFoundException('Checklist session not found');
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

  async submitContext(sessionId: string, organizationId: string, input: SubmitChecklistSessionContextInput, scope: object, actorId: string) {
    const { version: expectedVersion, values } = input;
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.checklistSession.findFirst({ where: { id: sessionId, organizationId, deletedAt: null, ...scope } });
      if (!session) throw new NotFoundException('Checklist session not found');
      if (session.observerId !== actorId) throw new NotFoundException('Checklist session not found');
      if (session.status !== 'in_progress' && session.status !== 'paused') {
        throw new BadRequestException(`Cannot record context for a session in status "${session.status}"`);
      }
      if (session.version !== expectedVersion) throw new ConflictException(STALE_WRITE_MESSAGE);

      const fields = parseContextFields(session.contextFieldsSnapshot);
      const byId = new Map(fields.map((field) => [field.id, field]));
      for (const [fieldId, value] of Object.entries(values)) {
        const field = byId.get(fieldId);
        if (!field) throw new BadRequestException(`Unknown context field: ${fieldId}`);
        if (field.type === 'date' && value !== '' && !isIsoDate(value)) {
          throw new BadRequestException(`Context field must be an ISO date: ${field.label}`);
        }
      }

      const merged = { ...parseContextValues(session.contextValues), ...values };
      const result = await tx.checklistSession.updateMany({
        where: { id: sessionId, organizationId, version: expectedVersion, status: { in: ['in_progress', 'paused'] } },
        data: { contextValues: merged as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException(STALE_WRITE_MESSAGE);
      return present(await tx.checklistSession.findUniqueOrThrow({ where: { id: sessionId } }));
    });
  }

  /** Capture is an assigned-observer action for every role (PR 352). */
  async captureLocation(
    sessionId: string,
    organizationId: string,
    capturePoint: ChecklistLocationCapturePoint,
    input: SubmitChecklistLocationCaptureInput,
    actorId: string,
    scope: object,
  ) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
      select: { id: true, observerId: true, locationCapturePolicy: true },
    });
    if (!session) throw new NotFoundException('Checklist session not found');
    if (session.observerId !== actorId) throw new NotFoundException('Checklist session not found');
    if (session.locationCapturePolicy === 'off') {
      throw new BadRequestException('Geolocation capture is disabled for this session');
    }

    let capture;
    try {
      capture = await this.prisma.$transaction(async (tx) => {
        const created = await tx.checklistLocationCapture.create({
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

        return created;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error, 'capture_point')) {
        throw new ConflictException(`A ${capturePoint} location capture already exists for this session`);
      }
      throw error;
    }

    return capture;
  }

  /**
   * Privacy-safe projection: only the assigned observer (who submitted the capture) and admin
   * see raw coordinates. Everyone else with read access to the session (manager, learner) sees
   * only that a capture happened, not where.
   *
   * PR 304: an admin reading another observer's exact coordinates is audited the same way the
   * historical write-side overrides were -- `checklist_location.accessed` -- since it is a privacy-
   * sensitive exception to the normal "only the observer sees their own coordinates" rule. Not
   * logged for the observer reading their own captures (the routine, expected case), nor when no
   * returned capture actually carries coordinates (e.g. all `denied`/`unavailable`, or none yet) --
   * there is nothing sensitive to have viewed.
   */
  async listLocationCaptures(sessionId: string, organizationId: string, scope: object, actorId: string, isAdmin: boolean) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
      select: { id: true, observerId: true },
    });
    if (!session) throw new NotFoundException('Checklist session not found');

    const isOwnCapture = session.observerId === actorId;
    const canSeeCoordinates = isAdmin || isOwnCapture;
    const captures = await this.prisma.checklistLocationCapture.findMany({
      where: { sessionId, organizationId },
      orderBy: { capturePoint: 'asc' },
    });

    if (!canSeeCoordinates) {
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

    const hasCoordinates = captures.some((capture) => capture.latitude !== null && capture.longitude !== null);
    if (!isOwnCapture && hasCoordinates) {
      await this.auditLog.record({
        organizationId,
        actorId,
        action: 'checklist_location.accessed',
        targetType: 'checklist_session',
        targetId: sessionId,
        summary: "Viewed another observer's exact geolocation coordinates",
        metadata: {},
      });
    }

    return captures;
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
  async recalculateScore(sessionId: string, organizationId: string, reason: string, actorId: string, scope: object, idempotencyKey?: string, formula: ChecklistScoreFormula = 'snapshot') {
    const idempotencyScope = 'session.recalculate';
    const { revision, previousPercentage, newPercentage, replayed } = await runSerializableWithRetry(this.prisma, async (tx) => {
      // The client needs to know whether `newPercentage` is a real score or the placeholder 0
      // computeInstanceScore() returns for an all-skipped, not-scored instance -- otherwise it
      // can't tell "recalculated to 0%" from "still not scored" apart. `ChecklistInstance.scored`
      // can't answer this for a *replay*: it's mutable (a later submitItemResult() can change it),
      // so reading it for an old cached response would return today's value, not the one this
      // exact recalculation actually produced. `ChecklistScoreRevision.newScored` is the immutable
      // historical fact instead -- re-reading it by the cached revision's own id is correct no
      // matter how much has happened to the instance since, and also covers cache rows written
      // before this response started including `scored` at all (raw historical JSON, never
      // migrated): those fall back to the same lookup.
      const cached = await this.findIdempotentResponse<Omit<ChecklistScoreRevision, 'formula'> & { formula?: ChecklistScoreFormula; scored?: boolean }>(tx, organizationId, idempotencyScope, idempotencyKey);
      if (cached) {
        const historical = cached.scored === undefined || cached.formula === undefined
          ? await tx.checklistScoreRevision.findUnique({ where: { id: cached.id }, select: { newScored: true, formula: true } })
          : null;
        const scored = cached.scored ?? historical?.newScored ?? false;
        const replayFormula = cached.formula ?? historical?.formula ?? 'snapshot';
        return { revision: { ...cached, scored, newScored: cached.newScored ?? scored, formula: replayFormula }, previousPercentage: cached.previousPercentage, newPercentage: cached.newPercentage, replayed: true };
      }

      const session = await tx.checklistSession.findFirst({
        where: { id: sessionId, organizationId, deletedAt: null, ...scope },
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
        formula,
      );
      const passed = scored && session.instance.status === 'completed' && percentage >= passThreshold;

      const createdRevision = await tx.checklistScoreRevision.create({
        data: {
          organizationId,
          instanceId: session.instanceId,
          formula,
          previousPercentage: session.instance.percentage,
          newPercentage: percentage,
          previousPassed: session.instance.passed,
          newPassed: passed,
          newScored: scored,
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
          metadata: { revisionId: createdRevision.id, formula, previousPercentage: session.instance.percentage, newPercentage: percentage },
        },
      });

      const revisionWithScored = { ...createdRevision, scored };
      await this.recordIdempotentResponse(tx, organizationId, idempotencyScope, idempotencyKey, revisionWithScored);

      return { revision: revisionWithScored, previousPercentage: session.instance.percentage, newPercentage: percentage, replayed: false };
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
        metadata: { sessionId, reason, formula },
      });
    }

    return revision;
  }

  async listScoreRevisions(sessionId: string, organizationId: string, scope: object) {
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: sessionId, organizationId, deletedAt: null, ...scope },
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
      durationMinutes?: number | null;
      locationCapturePolicy?: CreateChecklistSessionInput['locationCapturePolicy'];
      timezone?: string;
      actorId: string;
    },
    notificationOptions: { bulk?: boolean; alreadyNotified?: ReadonlySet<string> } = {},
  ) {
    await this.assertValidObserver(tx, input.observerId, input.organizationId);
    const employee = await tx.checklistInstance.findFirst({
      where: { id: input.instanceId, organizationId: input.organizationId, deletedAt: null },
      select: { userId: true },
    });
    if (!employee) throw new NotFoundException('Checklist assignment not found');
    if (employee.userId.toLowerCase() === input.observerId.toLowerCase()) throw new BadRequestException('An employee cannot observe their own session');

    const created = await tx.checklistSession.create({
      data: {
        organizationId: input.organizationId,
        instanceId: input.instanceId,
        observerId: input.observerId,
        scheduledAt: input.scheduledAt ?? undefined,
        durationMinutes: input.durationMinutes,
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

    await notifySessionChange(tx, created, 'checklist_session_scheduled', notificationOptions);
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
    // Check eligibility when choosing/reassigning, never when conducting an existing session.
    const observer = await tx.user.findFirst({
      where: {
        AND: [{ id: observerId }, await eligibleObserverScope(tx, organizationId)],
      },
      select: { id: true },
    });
    if (!observer) throw new BadRequestException('Observer is not eligible under the current workplace settings');
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

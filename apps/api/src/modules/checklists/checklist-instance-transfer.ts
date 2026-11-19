import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';

/**
 * PR 477: handing an unfinished self-filled check over to a colleague (a relay: one executor at a time).
 * The executor of an instance is `ChecklistInstance.userId`, so the hand-over moves that id; every answer and photo
 * stays on the instance. All rules live here, the controller only decides who the actor is.
 *
 * - Who may hand over: the executor, an administrator, or a manager whose team scope contains the executor
 *   (the scope is checked by the controller before this module is called).
 * - What may be handed over: an open check (assigned or in progress) of the organization, not a session (a session has
 *   an observer, see the observer reassignment), not a guest pass.
 * - To whom: an active user of the organization, not the executor, from a department the executor belongs to now.
 * - Two people changing the check at once: the move is a compare-and-set on the current executor, the status and the
 *   version (`updatedAt`) the screen has seen; a lost race answers 409 and nothing moves.
 */

export const CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB = 'checklists.instance-transfer-notify';
export const CHECKLIST_INSTANCE_TRANSFER_TYPE = 'checklist_instance_transferred';
export const TRANSFER_NOTE_MAX_LENGTH = 500;
export const TRANSFER_CANDIDATE_LIMIT = 200;
export const OPEN_INSTANCE_STATUSES = ['assigned', 'in_progress'] as const;

export type TransferActor = { id: string; organizationId: string; roles: readonly string[] };
export type TransferInput = { toUserId: string; note?: string | undefined; expectedUpdatedAt?: string | undefined };
export type TransferCandidate = { id: string; firstName: string; lastName: string };
export type TransferHistoryRow = {
  id: string; at: Date; note: string | null;
  from: { id: string; firstName: string; lastName: string } | null;
  to: { id: string; firstName: string; lastName: string } | null;
};
export type TransferredAwayRow = {
  id: string; checklistId: string; title: string; status: string; transferredAt: Date;
  toUser: { id: string; firstName: string; lastName: string } | null;
};

type InstanceFacts = { userId: string; status: string; guestName: string | null; session: { id: string } | null };

/** Pure: why an instance cannot be handed over, or null when it can. */
export function transferBlocker(instance: InstanceFacts): { kind: 'bad' | 'conflict'; message: string } | null {
  if (instance.session) return { kind: 'bad', message: 'A session is handed over by changing its observer' };
  if (instance.guestName !== null) return { kind: 'bad', message: 'A guest pass cannot be handed over' };
  if (!(OPEN_INSTANCE_STATUSES as readonly string[]).includes(instance.status)) return { kind: 'conflict', message: 'The check is already finished and cannot be handed over' };
  return null;
}

/** Pure: only the executor, an administrator or a manager (inside their team) may hand a check over. */
export function mayHandOver(actor: TransferActor, executorId: string): boolean {
  return actor.id === executorId || actor.roles.includes('admin') || actor.roles.includes('manager');
}

/** Colleagues of the executor: active, same organization, sharing a current department with them. */
export function colleagueWhere(organizationId: string, executorId: string, departmentIds: string[]): Prisma.UserWhereInput {
  return {
    organizationId, status: 'active', deletedAt: null, id: { not: executorId },
    departmentMemberships: { some: { organizationId, departmentId: { in: departmentIds }, effectiveTo: null } },
  };
}

export class ChecklistInstanceTransfer {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  private async load(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, userId: true, status: true, guestName: true, updatedAt: true, session: { select: { id: true } } },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');
    return instance;
  }

  private async executorDepartments(organizationId: string, executorId: string): Promise<string[]> {
    const rows = await this.prisma.departmentMembership.findMany({
      where: { organizationId, userId: executorId, effectiveTo: null }, select: { departmentId: true },
    });
    return [...new Set(rows.map((row) => row.departmentId))];
  }

  /** The people the check may be handed to; empty when the executor has no department. */
  async candidates(instanceId: string, actor: TransferActor): Promise<TransferCandidate[]> {
    const instance = await this.load(instanceId, actor.organizationId);
    if (!mayHandOver(actor, instance.userId)) throw new ForbiddenException('You cannot hand this check over');
    const blocker = transferBlocker(instance);
    if (blocker) return [];
    const departmentIds = await this.executorDepartments(actor.organizationId, instance.userId);
    if (departmentIds.length === 0) return [];
    return this.prisma.user.findMany({
      where: colleagueWhere(actor.organizationId, instance.userId, departmentIds),
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: TRANSFER_CANDIDATE_LIMIT,
    });
  }

  async transfer(instanceId: string, actor: TransferActor, input: TransferInput) {
    const { organizationId } = actor;
    const instance = await this.load(instanceId, organizationId);
    if (!mayHandOver(actor, instance.userId)) throw new ForbiddenException('You cannot hand this check over');
    const blocker = transferBlocker(instance);
    if (blocker) throw blocker.kind === 'bad' ? new BadRequestException(blocker.message) : new ConflictException(blocker.message);
    if (input.toUserId === instance.userId) throw new BadRequestException('The check is already with this person');
    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== instance.updatedAt.getTime()) {
      throw new ConflictException('The check was changed in the meantime, reload it and try again');
    }

    const departmentIds = await this.executorDepartments(organizationId, instance.userId);
    const recipient = departmentIds.length === 0 ? null : await this.prisma.user.findFirst({
      where: { AND: [colleagueWhere(organizationId, instance.userId, departmentIds), { id: input.toUserId }] },
      select: { id: true },
    });
    if (!recipient) throw new BadRequestException('This person cannot take the check');

    const note = input.note?.trim() ? input.note.trim() : undefined;
    const moved = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.checklistInstance.updateMany({
        where: { id: instanceId, organizationId, userId: instance.userId, status: { in: [...OPEN_INSTANCE_STATUSES] }, updatedAt: instance.updatedAt },
        data: { userId: recipient.id },
      });
      if (claimed.count !== 1) return false;
      await tx.checklistInstanceEvent.create({
        data: {
          organizationId, instanceId, eventType: 'transferred', actorUserId: actor.id,
          metadata: { fromUserId: instance.userId, toUserId: recipient.id, ...(note ? { note } : {}) },
        },
      });
      await notifyInstanceTransferred(tx, { organizationId, instanceId, toUserId: recipient.id });
      return true;
    });
    if (!moved) throw new ConflictException('The check was changed in the meantime, reload it and try again');

    await this.auditLog.record({
      organizationId, actorId: actor.id, action: 'checklist_instance.transferred', targetType: 'checklist_instance', targetId: instanceId,
      summary: 'Handed the check over to a colleague',
      // Ids only: no names, no note.
      metadata: { fromUserId: instance.userId, toUserId: recipient.id, hasNote: note !== undefined },
    });
    return { id: instanceId, userId: recipient.id };
  }

  /** The hand-overs of one check, oldest first, with names; the report of a filled check (PR 478) shows the same list. */
  async history(instanceId: string, organizationId: string): Promise<TransferHistoryRow[]> {
    const events = await this.prisma.checklistInstanceEvent.findMany({
      where: { instanceId, organizationId, eventType: 'transferred', instance: { deletedAt: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, createdAt: true, metadata: true },
    });
    const ref = (metadata: unknown, key: 'fromUserId' | 'toUserId') => {
      const value = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>)[key] : undefined;
      return typeof value === 'string' ? value : null;
    };
    const ids = [...new Set(events.flatMap((event) => [ref(event.metadata, 'fromUserId'), ref(event.metadata, 'toUserId')].filter((id): id is string => id !== null)))];
    const users = ids.length === 0 ? [] : await this.prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(users.map((user) => [user.id, user]));
    return events.map((event) => {
      const note = (event.metadata as Record<string, unknown> | null)?.['note'];
      const from = ref(event.metadata, 'fromUserId');
      const to = ref(event.metadata, 'toUserId');
      return { id: event.id, at: event.createdAt, note: typeof note === 'string' ? note : null, from: from ? byId.get(from) ?? null : null, to: to ? byId.get(to) ?? null : null };
    });
  }

  /** Checks the user handed away that are still open, for the list of "Handed over" in their own checks. */
  async transferredAway(userId: string, organizationId: string): Promise<TransferredAwayRow[]> {
    const events = await this.prisma.checklistInstanceEvent.findMany({
      where: {
        organizationId, eventType: 'transferred', metadata: { path: ['fromUserId'], equals: userId },
        instance: { organizationId, deletedAt: null, userId: { not: userId }, status: { in: [...OPEN_INSTANCE_STATUSES] } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        createdAt: true, metadata: true,
        instance: { select: { id: true, checklistId: true, status: true, checklist: { select: { title: true } }, user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    const seen = new Set<string>();
    const rows: TransferredAwayRow[] = [];
    for (const event of events) {
      if (seen.has(event.instance.id)) continue;
      seen.add(event.instance.id);
      rows.push({
        id: event.instance.id, checklistId: event.instance.checklistId, title: event.instance.checklist.title, status: event.instance.status,
        transferredAt: event.createdAt, toUser: event.instance.user,
      });
    }
    return rows;
  }
}

/** Inside the hand-over transaction: the portal notification and the durable mail job; never carries names, the note or the title. */
export async function notifyInstanceTransferred(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; instanceId: string; toUserId: string },
): Promise<void> {
  const notification = await tx.notification.create({ data: {
    organizationId: input.organizationId, userId: input.toUserId, type: CHECKLIST_INSTANCE_TRANSFER_TYPE,
    data: { instanceId: input.instanceId }, link: `/learn/checklists?open=${encodeURIComponent(input.instanceId)}`,
  } });
  await tx.outboxEvent.create({ data: {
    topic: CHECKLIST_INSTANCE_TRANSFER_NOTIFY_JOB,
    payload: { organizationId: input.organizationId, notificationId: notification.id },
  } });
}

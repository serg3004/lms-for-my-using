import { ConflictException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';

/** PR 367: how long an administrator can still restore a deleted result. */
export const RESULT_RESTORE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PR 367: administrator-only soft deletion of a finished result. The instance and its paired session
 * get the same `deletedAt`, so every existing read, report, export and analytics query (all filter
 * `deletedAt: null`) drops them. `resultDeleteReason` marks the deletion as an administrator's, so
 * a session cancelled the ordinary way (which also sets `deletedAt`) can never be "restored" here.
 */
export class ChecklistResultDeletion {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  async delete(instanceId: string, organizationId: string, reason: string, actorId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, status: true, checklistId: true, userId: true },
    });
    if (!instance) throw new NotFoundException('Checklist result not found');
    if (instance.status !== 'completed') throw new ConflictException('Only a finished result can be deleted');

    const now = new Date();
    const changed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.checklistInstance.updateMany({
        where: { id: instanceId, organizationId, deletedAt: null, status: 'completed' },
        data: { deletedAt: now, resultDeleteReason: reason, resultDeletedBy: actorId },
      });
      if (updated.count === 0) return false;
      await tx.checklistSession.updateMany({
        where: { instanceId, organizationId, deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      return true;
    });
    if (!changed) throw new ConflictException('The result was changed by someone else');

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_result.deleted',
      targetType: 'checklist_instance',
      targetId: instanceId,
      summary: 'Deleted a checklist result',
      metadata: { checklistId: instance.checklistId, userId: instance.userId, reason },
    });
    return { id: instanceId, deletedAt: now.toISOString(), restorableUntil: restorableUntil(now) };
  }

  async restore(instanceId: string, organizationId: string, actorId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: { not: null }, resultDeleteReason: { not: null } },
      select: { id: true, deletedAt: true, checklistId: true, userId: true },
    });
    if (!instance?.deletedAt) throw new NotFoundException('Deleted checklist result not found');
    if (Date.now() - instance.deletedAt.getTime() > RESULT_RESTORE_WINDOW_DAYS * DAY_MS) {
      throw new ConflictException(`A result can be restored within ${RESULT_RESTORE_WINDOW_DAYS} days of deletion`);
    }

    const changed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.checklistInstance.updateMany({
        where: { id: instanceId, organizationId, deletedAt: instance.deletedAt, resultDeleteReason: { not: null } },
        data: { deletedAt: null, resultDeleteReason: null, resultDeletedBy: null },
      });
      if (updated.count === 0) return false;
      await tx.checklistSession.updateMany({
        where: { instanceId, organizationId, deletedAt: instance.deletedAt },
        data: { deletedAt: null, version: { increment: 1 } },
      });
      return true;
    });
    if (!changed) throw new ConflictException('The result was changed by someone else');

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_result.restored',
      targetType: 'checklist_instance',
      targetId: instanceId,
      summary: 'Restored a checklist result',
      metadata: { checklistId: instance.checklistId, userId: instance.userId },
    });
    return { id: instanceId };
  }

  async listDeleted(organizationId: string) {
    const rows = await this.prisma.checklistInstance.findMany({
      where: { organizationId, deletedAt: { not: null }, resultDeleteReason: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take: 100,
      select: {
        id: true, deletedAt: true, resultDeleteReason: true, percentage: true, passed: true, completedAt: true,
        checklist: { select: { id: true, title: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      deletedAt: row.deletedAt!.toISOString(),
      reason: row.resultDeleteReason!,
      restorableUntil: restorableUntil(row.deletedAt!),
      percentage: row.percentage,
      passed: row.passed,
      completedAt: row.completedAt?.toISOString() ?? null,
      checklist: row.checklist,
      user: row.user,
    }));
  }
}

function restorableUntil(deletedAt: Date) {
  return new Date(deletedAt.getTime() + RESULT_RESTORE_WINDOW_DAYS * DAY_MS).toISOString();
}

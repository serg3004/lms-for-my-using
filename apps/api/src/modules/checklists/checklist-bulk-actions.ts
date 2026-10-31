import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';

/** PR 394: most sheets one bulk request may touch. */
export const MAX_BULK_CHECKLISTS = 100;

export type ChecklistBulkAction = 'archive' | 'draft' | 'publish' | 'delete';
export type ChecklistBulkOutcome =
  | { id: string; result: 'done' }
  // `moved_to_draft`: a delete that was refused because of active assignments; the sheet became a draft instead.
  | { id: string; result: 'skipped'; reason: 'not_found' | 'forbidden' | 'already_in_status' | 'has_active_assignments' | 'cannot_publish' | 'moved_to_draft'; message?: string };

type Actor = { id: string; roles: readonly string[] };
type Operations = {
  setStatus(id: string, organizationId: string, status: 'draft' | 'published' | 'archived', actorId: string): Promise<unknown>;
  remove(id: string, organizationId: string, actorId: string): Promise<void>;
};

const TARGET_STATUS = { archive: 'archived', draft: 'draft', publish: 'published' } as const;

/**
 * Applies one action to many sheets, one at a time, with the same rules as the single-sheet operations:
 * edit rights (creator / admin / allowEditByAll), the publish checks and the "no active assignment" delete rule.
 * A sheet that cannot be changed is skipped with a reason, never failing the whole request. A delete that is
 * refused only because of active assignments turns the sheet into a draft (owner decision 2026-10-31).
 */
export class ChecklistBulkActions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly operations: Operations,
  ) {}

  async run(action: ChecklistBulkAction, ids: readonly string[], organizationId: string, actor: Actor) {
    const uniqueIds = [...new Set(ids)];
    const outcomes: ChecklistBulkOutcome[] = [];
    for (const id of uniqueIds) outcomes.push(await this.runOne(action, id, organizationId, actor));
    const done = outcomes.filter((outcome) => outcome.result === 'done').length;
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist.bulk',
      targetType: 'checklist',
      targetId: null,
      summary: `Bulk ${action}: ${done} done, ${outcomes.length - done} skipped`,
      metadata: { action, requested: uniqueIds.length, done },
    });
    return { action, done, skipped: outcomes.length - done, results: outcomes };
  }

  private async runOne(action: ChecklistBulkAction, id: string, organizationId: string, actor: Actor): Promise<ChecklistBulkOutcome> {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { status: true, createdBy: true, allowEditByAll: true },
    });
    if (!checklist) return { id, result: 'skipped', reason: 'not_found' };
    if (!(checklist.allowEditByAll || checklist.createdBy === actor.id || actor.roles.includes('admin'))) {
      return { id, result: 'skipped', reason: 'forbidden' };
    }
    try {
      if (action === 'delete') return await this.deleteOne(id, organizationId, actor.id);
      const status = TARGET_STATUS[action];
      if (checklist.status === status) return { id, result: 'skipped', reason: 'already_in_status' };
      await this.operations.setStatus(id, organizationId, status, actor.id);
      return { id, result: 'done' };
    } catch (error) {
      if (error instanceof NotFoundException) return { id, result: 'skipped', reason: 'not_found' };
      if (error instanceof BadRequestException) return { id, result: 'skipped', reason: 'cannot_publish', message: error.message };
      throw error;
    }
  }

  private async deleteOne(id: string, organizationId: string, actorId: string): Promise<ChecklistBulkOutcome> {
    const active = await this.prisma.checklistInstance.findFirst({
      where: { checklistId: id, status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null },
      select: { id: true },
    });
    if (active) {
      await this.operations.setStatus(id, organizationId, 'draft', actorId);
      return { id, result: 'skipped', reason: 'moved_to_draft' };
    }
    await this.operations.remove(id, organizationId, actorId);
    return { id, result: 'done' };
  }
}

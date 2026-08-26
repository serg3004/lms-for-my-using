import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogQuery } from './audit-log.schemas.js';

export type AuditLogAction =
  | 'user.created'
  | 'user.updated'
  | 'user.status_changed'
  | 'membership.assigned'
  | 'organization.theme_updated'
  | 'organization.theme_reset'
  | 'course.created'
  | 'course.updated'
  | 'course.deleted'
  | 'lesson.created'
  | 'lesson.updated'
  | 'lesson.deleted'
  | 'group.created'
  | 'group.updated'
  | 'assignment.created'
  | 'checklist.created'
  | 'checklist.updated'
  | 'checklist.deleted'
  | 'checklist_instance.assigned'
  | 'checklist_item_result.reviewed'
  | 'certificate.issued';

export type RecordAuditLogInput = {
  organizationId: string;
  actorId: string | null;
  action: AuditLogAction;
  targetType: string;
  targetId?: string | null;
  summary: string;
  /** Never put secrets, tokens, or raw file/object keys here — this is read by any admin. */
  metadata?: Record<string, unknown>;
};

const REVIEW_LIMIT = 100;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort write: a logging failure must never fail the mutation it describes,
   * so errors are caught and logged rather than propagated.
   */
  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          summary: input.summary,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to record audit log entry (action=${input.action})`, error as Error);
    }
  }

  async list(organizationId: string, query: AuditLogQuery) {
    const skip = (query.page - 1) * query.pageSize;
    const where = {
      organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    } as const;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const actorIds = [...new Set(items.map((item) => item.actorId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return {
      items: items.map((item) => ({ ...item, actor: item.actorId ? actorById.get(item.actorId) ?? null : null })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Distinct actions/target types seen recently, to populate filter dropdowns. */
  async listFilterOptions(organizationId: string) {
    const [actions, targetTypes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
        take: REVIEW_LIMIT,
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['targetType'],
        select: { targetType: true },
        orderBy: { targetType: 'asc' },
        take: REVIEW_LIMIT,
      }),
    ]);
    return {
      actions: actions.map((a) => a.action),
      targetTypes: targetTypes.map((t) => t.targetType),
    };
  }
}

import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service.js';

export const ACTIVE_CHECKLIST_INSTANCE_STATUSES = ['assigned', 'in_progress'] as const;
export const CHECKLIST_EXPIRED_MESSAGE = 'This checklist assignment has expired';

export function isChecklistDeadlineReached(dueAt: Date | null | undefined, now: Date) {
  return Boolean(dueAt && dueAt.getTime() <= now.getTime());
}

export async function expireDueChecklistInstances(
  prisma: PrismaService,
  scope: Prisma.ChecklistInstanceWhereInput,
  now: Date,
) {
  const result = await prisma.checklistInstance.updateMany({
    where: {
      ...scope,
      deletedAt: null,
      status: { in: [...ACTIVE_CHECKLIST_INSTANCE_STATUSES] },
      dueAt: { lte: now },
    },
    data: { status: 'expired' },
  });
  return result.count;
}

export async function expireDueChecklistBatch(
  prisma: PrismaService,
  now: Date,
  batchSize = 500,
) {
  const candidates = await prisma.checklistInstance.findMany({
    where: {
      deletedAt: null,
      status: { in: [...ACTIVE_CHECKLIST_INSTANCE_STATUSES] },
      dueAt: { lte: now },
    },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true, organizationId: true },
  });

  const idsByOrganization = new Map<string, string[]>();
  for (const candidate of candidates) {
    const ids = idsByOrganization.get(candidate.organizationId) ?? [];
    ids.push(candidate.id);
    idsByOrganization.set(candidate.organizationId, ids);
  }

  let expired = 0;
  for (const [organizationId, ids] of idsByOrganization) {
    const result = await prisma.checklistInstance.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: { in: [...ACTIVE_CHECKLIST_INSTANCE_STATUSES] },
        dueAt: { lte: now },
      },
      data: { status: 'expired' },
    });
    expired += result.count;
  }

  return { selected: candidates.length, expired };
}

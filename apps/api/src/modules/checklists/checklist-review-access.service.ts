import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';
import { isManagerTeamScoped, ManagerTeamScope } from '../manager-team-scope/public.js';

@Injectable()
export class ChecklistReviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: ManagerTeamScope,
  ) {}

  async filterPending<T extends { userId: string }>(user: CurrentUser, instances: T[]): Promise<T[]> {
    if (!isManagerTeamScoped(user) || instances.length === 0) return instances;

    const allowedUsers = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        id: { in: instances.map((instance) => instance.userId) },
        deletedAt: null,
        ...this.teamScope.user(user),
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowedUsers.map((candidate) => candidate.id));
    return instances.filter((instance) => allowedIds.has(instance.userId));
  }

  async assertReviewerCanAccess(user: CurrentUser, instanceId: string) {
    if (!isManagerTeamScoped(user)) return;

    const instance = await this.prisma.checklistInstance.findFirst({
      where: {
        id: instanceId,
        organizationId: user.organizationId,
        deletedAt: null,
        ...this.teamScope.userOwnedResource(user),
      },
      select: { id: true },
    });

    if (!instance) throw new NotFoundException('Checklist assignment not found');
  }
}

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async getSummary(actor: TeamScopeActor) {
    const baseWhere = { organizationId: actor.organizationId, deletedAt: null } as const;
    const [progress, certificates, overdueAssignments] = await Promise.all([
      this.prisma.progress.findMany({
        where: { ...baseWhere, ...this.teamScope.userOwnedResource(actor) },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          score: true,
          completedAt: true,
          course: { select: { id: true, title: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.certificate.findMany({
        where: { ...baseWhere, ...this.teamScope.userOwnedResource(actor) },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          status: true,
          issuedAt: true,
          course: { select: { id: true, title: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.assignment.findMany({
        where: {
          ...baseWhere,
          status: 'assigned',
          dueAt: { lt: new Date() },
          ...this.teamScope.assignment(actor),
        },
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          dueAt: true,
          course: { select: { id: true, title: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          group: { select: { id: true, name: true } },
        },
      }),
    ]);

    return { progress, certificates, overdueAssignments };
  }
}

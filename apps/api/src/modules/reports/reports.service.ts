import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

// Recent-activity lists are bounded to a top-N, not paginated: summary counts (below)
// are computed database-side over the full dataset so stat cards stay correct even
// when a tenant has more rows than this limit.
const REPORTS_LIST_LIMIT = 100;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async getSummary(actor: TeamScopeActor) {
    const baseWhere = { organizationId: actor.organizationId, deletedAt: null } as const;
    const progressWhere = { ...baseWhere, ...this.teamScope.userOwnedResource(actor) };
    const certificateWhere = { ...baseWhere, ...this.teamScope.userOwnedResource(actor) };
    const overdueWhere = {
      ...baseWhere,
      status: 'assigned' as const,
      dueAt: { lt: new Date() },
      ...this.teamScope.assignment(actor),
    };

    const [progress, certificates, overdueAssignments, progressTotal, progressCompletedTotal, progressAvgScore, certificatesIssuedTotal, overdueTotal] =
      await Promise.all([
        this.prisma.progress.findMany({
          where: progressWhere,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: REPORTS_LIST_LIMIT,
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
          where: certificateWhere,
          orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
          take: REPORTS_LIST_LIMIT,
          select: {
            id: true,
            status: true,
            issuedAt: true,
            course: { select: { id: true, title: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.assignment.findMany({
          where: overdueWhere,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          take: REPORTS_LIST_LIMIT,
          select: {
            id: true,
            dueAt: true,
            course: { select: { id: true, title: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            group: { select: { id: true, name: true } },
          },
        }),
        this.prisma.progress.count({ where: progressWhere }),
        this.prisma.progress.count({ where: { ...progressWhere, status: 'completed' } }),
        this.prisma.progress.aggregate({ where: progressWhere, _avg: { score: true } }),
        this.prisma.certificate.count({ where: { ...certificateWhere, status: 'issued' } }),
        this.prisma.assignment.count({ where: overdueWhere }),
      ]);

    return {
      progress,
      certificates,
      overdueAssignments,
      counts: {
        progressTotal,
        progressCompletedTotal,
        progressAvgScore: progressAvgScore._avg.score,
        certificatesIssuedTotal,
        overdueTotal,
      },
    };
  }

  async getAdminDashboard(actor: TeamScopeActor) {
    const where = { organizationId: actor.organizationId, deletedAt: null } as const;
    const [
      usersTotal,
      coursesTotal,
      progressTotal,
      progressCompletedTotal,
      certificatesTotal,
      pendingActivationCount,
      users,
      certificates,
      completedProgress,
    ] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.course.count({ where }),
      this.prisma.progress.count({ where }),
      this.prisma.progress.count({ where: { ...where, completedAt: { not: null } } }),
      this.prisma.certificate.count({ where }),
      this.prisma.user.count({ where: { ...where, status: 'invited' } }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 5,
        select: { id: true, firstName: true, lastName: true, createdAt: true },
      }),
      this.prisma.certificate.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
        take: 5,
        select: { id: true, issuedAt: true },
      }),
      this.prisma.progress.findMany({
        where: { ...where, completedAt: { not: null } },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: 5,
        select: { id: true, completedAt: true },
      }),
    ]);

    const activity = [
      ...users.map((user) => ({ type: 'user_added' as const, id: user.id, date: user.createdAt, firstName: user.firstName, lastName: user.lastName })),
      ...certificates.map((certificate) => ({ type: 'certificate_issued' as const, id: certificate.id, date: certificate.issuedAt })),
      ...completedProgress.map((progress) => ({ type: 'lesson_completed' as const, id: progress.id, date: progress.completedAt! })),
    ].sort((left, right) => right.date.getTime() - left.date.getTime()).slice(0, 5);

    return {
      usersTotal,
      coursesTotal,
      completionRate: progressTotal === 0 ? 0 : Math.round((progressCompletedTotal / progressTotal) * 100),
      certificatesTotal,
      pendingActivationCount,
      activity,
    };
  }
}

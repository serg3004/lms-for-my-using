import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service.js';
import type { ChecklistAnalyticsFilterSetInput } from './checklists.schemas.js';

const ORGANIZATION_KEY = 'organization';
const EMPLOYEE_LIMIT = 20;

/** PR 518: the filters of the analytics tab (kept per user, with an organization default) and the employee picker. Plain helper, built in ChecklistsService's constructor body. */
export class ChecklistAnalyticsFilters {
  constructor(private readonly prisma: PrismaService) {}

  /** The viewer's own set and the organization default; the client falls back from the first to the second to the built-in order. */
  async getSet(organizationId: string, userId: string) {
    const rows = await this.prisma.checklistAnalyticsFilterSet.findMany({ where: { organizationId, ownerKey: { in: [userId, ORGANIZATION_KEY] } } });
    return {
      user: rows.find((row) => row.ownerKey === userId)?.filters ?? null,
      organization: rows.find((row) => row.ownerKey === ORGANIZATION_KEY)?.filters ?? null,
    };
  }

  /** Saves the set; only an administrator may write the organization default. An empty list for a user resets it. */
  async saveSet(organizationId: string, actor: { id: string; roles: readonly string[] }, input: ChecklistAnalyticsFilterSetInput, forbidden: () => never) {
    if (input.scope === 'organization' && !actor.roles.includes('admin')) forbidden();
    const ownerKey = input.scope === 'organization' ? ORGANIZATION_KEY : actor.id;
    if (input.filters.length === 0) {
      await this.prisma.checklistAnalyticsFilterSet.deleteMany({ where: { organizationId, ownerKey } });
    } else {
      await this.prisma.checklistAnalyticsFilterSet.upsert({
        where: { organizationId_ownerKey: { organizationId, ownerKey } },
        create: { organizationId, ownerKey, filters: input.filters },
        update: { filters: input.filters },
      });
    }
    return this.getSet(organizationId, actor.id);
  }

  /** Employees the viewer may analyse (their own scope), found by name or email, for the employee filter. */
  async employees(organizationId: string, userScope: Prisma.UserWhereInput, search: string | undefined) {
    const needle = search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { organizationId, deletedAt: null },
          userScope,
          ...(needle ? [{ OR: [{ firstName: { contains: needle, mode: 'insensitive' as const } }, { lastName: { contains: needle, mode: 'insensitive' as const } }, { email: { contains: needle, mode: 'insensitive' as const } }] }] : []),
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: EMPLOYEE_LIMIT,
    });
    return users.map((user) => ({ id: user.id, name: `${user.lastName} ${user.firstName}`.trim() }));
  }
}

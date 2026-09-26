import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import { OrgStructureAdminService } from './org-structure-admin.service.js';

const orgId = '11111111-1111-1111-1111-111111111111';

describe('OrgStructureAdminService.counts', () => {
  function prismaWithCounts() {
    return {
      department: { count: jest.fn<() => Promise<number>>().mockResolvedValue(7) },
      position: { count: jest.fn<() => Promise<number>>().mockResolvedValue(4) },
      positionCourse: { count: jest.fn<() => Promise<number>>().mockResolvedValue(3) },
      group: { count: jest.fn<() => Promise<number>>().mockResolvedValue(2) },
      orgStructureEvent: { count: jest.fn<() => Promise<number>>().mockResolvedValue(15) },
    };
  }

  it('returns the five section counts', async () => {
    const prisma = prismaWithCounts();
    const service = new OrgStructureAdminService(prisma as unknown as PrismaService);

    await expect(service.counts(orgId)).resolves.toEqual({ departments: 7, positions: 4, positionCourses: 3, groups: 2, historyEvents: 15 });
  });

  it('counts only active rows of the given organization and every history event of it', async () => {
    const prisma = prismaWithCounts();
    const service = new OrgStructureAdminService(prisma as unknown as PrismaService);

    await service.counts(orgId);

    expect(prisma.department.count).toHaveBeenCalledWith({ where: { organizationId: orgId, status: 'active' } });
    expect(prisma.position.count).toHaveBeenCalledWith({ where: { organizationId: orgId, status: 'active' } });
    expect(prisma.positionCourse.count).toHaveBeenCalledWith({ where: { organizationId: orgId, status: 'active' } });
    expect(prisma.group.count).toHaveBeenCalledWith({ where: { organizationId: orgId, status: 'active', deletedAt: null } });
    expect(prisma.orgStructureEvent.count).toHaveBeenCalledWith({ where: { organizationId: orgId } });
  });
});

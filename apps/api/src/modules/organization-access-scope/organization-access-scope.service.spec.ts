import { jest } from '@jest/globals';

import { ManagerTeamScope } from '../manager-team-scope/manager-team-scope.js';
import { OrganizationAccessScopeService } from './organization-access-scope.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const manager = { id: '22222222-2222-4222-8222-222222222222', organizationId, roles: ['manager'] as const };

function buildPrisma(overrides: {
  managedDepartments?: { departmentId: string }[];
  subtreeIds?: string[];
  reportIds?: string[];
} = {}) {
  const departmentManagerFindMany = jest.fn(async () => overrides.managedDepartments ?? []);
  // $queryRaw is called as a tagged template for two different raw queries (department subtree
  // and reporting-line transitive reports) concurrently via Promise.all -- distinguish by the
  // table name baked into the query text rather than relying on call order.
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('');
    if (sql.includes('reporting_lines')) return (overrides.reportIds ?? []).map((id) => ({ id }));
    return (overrides.subtreeIds ?? []).map((id) => ({ id }));
  });
  return {
    departmentManager: { findMany: departmentManagerFindMany },
    $queryRaw: queryRaw,
  } as unknown as import('../../database/prisma.service.js').PrismaService;
}

describe('OrganizationAccessScopeService', () => {
  it('returns an unrestricted where for admins without querying DepartmentManager', async () => {
    const prisma = buildPrisma();
    const service = new OrganizationAccessScopeService(prisma);
    const admin = { ...manager, roles: ['manager', 'admin'] as const };

    await expect(service.user(admin)).resolves.toEqual({});
    await expect(service.assignment(admin)).resolves.toEqual({});
    await expect(service.userOwnedResource(admin)).resolves.toEqual({});
    await expect(service.managedDepartmentIds(admin)).resolves.toEqual([]);
    await expect(service.directReportIds(admin)).resolves.toEqual([]);
    expect((prisma.departmentManager.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does not apply manager scope to other roles', async () => {
    const prisma = buildPrisma();
    const service = new OrganizationAccessScopeService(prisma);

    await expect(service.user({ ...manager, roles: ['instructor'] as const })).resolves.toEqual({});
  });

  it('falls back to the existing ManagerGroup scope when the actor manages no departments and has no direct reports', async () => {
    const prisma = buildPrisma({ managedDepartments: [], reportIds: [] });
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.user(manager)).resolves.toEqual(teamScope.user(manager));
  });

  it('unions ManagerGroup scope with the DIRECT-managed department subtree', async () => {
    const departmentId = '33333333-3333-4333-8333-333333333333';
    const childId = '44444444-4444-4444-8444-444444444444';
    const prisma = buildPrisma({
      managedDepartments: [{ departmentId }],
      subtreeIds: [departmentId, childId],
    });
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.managedDepartmentIds(manager)).resolves.toEqual([departmentId, childId]);
    await expect(service.user(manager)).resolves.toEqual({
      OR: [
        teamScope.user(manager),
        {
          departmentMemberships: {
            some: {
              organizationId,
              departmentId: { in: [departmentId, childId] },
              isPrimary: true,
              effectiveTo: null,
            },
          },
        },
      ],
    });
  });

  it('unions ManagerGroup scope with direct and transitive DIRECT ReportingLine reports', async () => {
    const reportId = '55555555-5555-4555-8555-555555555555';
    const transitiveReportId = '66666666-6666-4666-8666-666666666666';
    const prisma = buildPrisma({ reportIds: [reportId, transitiveReportId] });
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.directReportIds(manager)).resolves.toEqual([reportId, transitiveReportId]);
    await expect(service.user(manager)).resolves.toEqual({
      OR: [teamScope.user(manager), { id: { in: [reportId, transitiveReportId] } }],
    });
  });

  it('unions all three sources at once when the actor has both a department and direct reports', async () => {
    const departmentId = '33333333-3333-4333-8333-333333333333';
    const reportId = '55555555-5555-4555-8555-555555555555';
    const prisma = buildPrisma({ managedDepartments: [{ departmentId }], subtreeIds: [departmentId], reportIds: [reportId] });
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.user(manager)).resolves.toEqual({
      OR: [
        teamScope.user(manager),
        {
          departmentMemberships: {
            some: { organizationId, departmentId: { in: [departmentId] }, isPrimary: true, effectiveTo: null },
          },
        },
        { id: { in: [reportId] } },
      ],
    });
  });

  it('only counts current DIRECT rows, never FUNCTIONAL or closed ones, when querying managed departments', async () => {
    const findMany = jest.fn(async () => []);
    const prisma = { departmentManager: { findMany }, $queryRaw: jest.fn(async () => []) } as unknown as import('../../database/prisma.service.js').PrismaService;
    const service = new OrganizationAccessScopeService(prisma);

    await service.managedDepartmentIds(manager);

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId, userId: manager.id, type: 'DIRECT', effectiveTo: null },
      select: { departmentId: true },
    });
  });

  it('includes user-scope and group-scope branches for assignments', async () => {
    const prisma = buildPrisma();
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.assignment(manager)).resolves.toEqual({
      OR: [{ user: teamScope.user(manager) }, { group: teamScope.group(manager) }],
    });
  });

  it('wraps user scope for userOwnedResource', async () => {
    const prisma = buildPrisma();
    const teamScope = new ManagerTeamScope();
    const service = new OrganizationAccessScopeService(prisma, teamScope);

    await expect(service.userOwnedResource(manager)).resolves.toEqual({ user: teamScope.user(manager) });
  });
});

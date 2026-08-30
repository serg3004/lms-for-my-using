/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the real DB-side headcount aggregation (department-tree-queries.ts's
 * getDirectHeadcounts/getSubtreeHeadcounts) against real Postgres data -- a mocked-Prisma unit
 * test (departments.service.spec.ts) only checks that the raw-query results get merged
 * correctly, not that the SQL itself computes the right numbers over real rows.
 */
describe('department headcounts (database)', () => {
  const prisma = new PrismaClient();
  const departmentsService = new DepartmentsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const membershipsService = new DepartmentMembershipsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Department headcounts ${suffix}`, slug: `department-headcounts-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser(organizationId: string, label: string, status: 'active' | 'suspended' = 'active') {
    return prisma.user.create({
      data: {
        organizationId,
        email: `${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Headcount',
        lastName: label,
        status,
      },
    });
  }

  async function createDepartment(organizationId: string, name: string, parentId?: string) {
    return departmentsService.createDepartment(
      { organizationId, name, parentId, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('counts only current active primary memberships direct to the department, excluding additional/inactive/historical', async () => {
    const organization = await createOrganization();
    const department = await createDepartment(organization.id, 'Engineering');

    const primaryActive = await createUser(organization.id, 'PrimaryActive');
    const additional = await createUser(organization.id, 'Additional');
    const inactive = await createUser(organization.id, 'Inactive');
    const historical = await createUser(organization.id, 'Historical');

    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: primaryActive.id, isPrimary: true },
      null,
    );
    // Additional (non-primary) membership must not count toward direct headcount.
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: additional.id, isPrimary: false },
      null,
    );
    // Assigned while active, then disabled -- ensureAssignable only blocks *new* assignments to
    // an inactive user, so this is the realistic path to an inactive user with a still-current
    // primary membership (the invariant this test is actually checking).
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: inactive.id, isPrimary: true },
      null,
    );
    await prisma.user.update({ where: { id: inactive.id }, data: { status: 'suspended' } });
    // Historical (closed) membership must not count even though it was once primary.
    const historicalMembership = await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: historical.id, isPrimary: true },
      null,
    );
    await membershipsService.closeMembership(historicalMembership.id, organization.id, null);

    const reloaded = await departmentsService.getDepartment(department.id, organization.id);
    expect(reloaded.directUserCount).toBe(1);
    expect(reloaded.subtreeUserCount).toBe(1);
  });

  it('counts unique users across the department and its descendants for subtreeUserCount, without double-counting', async () => {
    const organization = await createOrganization();
    const root = await createDepartment(organization.id, 'Company');
    const division = await createDepartment(organization.id, 'Division', root.id);
    const team = await createDepartment(organization.id, 'Team', division.id);

    const rootUser = await createUser(organization.id, 'RootUser');
    const divisionUser = await createUser(organization.id, 'DivisionUser');
    const teamUser = await createUser(organization.id, 'TeamUser');

    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: root.id, userId: rootUser.id, isPrimary: true },
      null,
    );
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: division.id, userId: divisionUser.id, isPrimary: true },
      null,
    );
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: team.id, userId: teamUser.id, isPrimary: true },
      null,
    );

    const [reloadedRoot, reloadedDivision, reloadedTeam] = await Promise.all([
      departmentsService.getDepartment(root.id, organization.id),
      departmentsService.getDepartment(division.id, organization.id),
      departmentsService.getDepartment(team.id, organization.id),
    ]);

    expect(reloadedRoot.directUserCount).toBe(1);
    expect(reloadedRoot.subtreeUserCount).toBe(3);
    expect(reloadedDivision.directUserCount).toBe(1);
    expect(reloadedDivision.subtreeUserCount).toBe(2);
    expect(reloadedTeam.directUserCount).toBe(1);
    expect(reloadedTeam.subtreeUserCount).toBe(1);
  });

  it('updates direct and subtree counts for both departments after a primary transfer', async () => {
    const organization = await createOrganization();
    const from = await createDepartment(organization.id, 'From dept');
    const to = await createDepartment(organization.id, 'To dept');
    const user = await createUser(organization.id, 'Transferred');

    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: from.id, userId: user.id, isPrimary: true },
      null,
    );
    await membershipsService.transferPrimaryDepartment(user.id, organization.id, { departmentId: to.id }, null);

    const [reloadedFrom, reloadedTo] = await Promise.all([
      departmentsService.getDepartment(from.id, organization.id),
      departmentsService.getDepartment(to.id, organization.id),
    ]);
    expect(reloadedFrom.directUserCount).toBe(0);
    expect(reloadedTo.directUserCount).toBe(1);
  });

  it('moves subtree headcount to the new parent after a reparent, without changing direct counts', async () => {
    const organization = await createOrganization();
    const oldParent = await createDepartment(organization.id, 'Old parent');
    const newParent = await createDepartment(organization.id, 'New parent');
    const child = await createDepartment(organization.id, 'Child', oldParent.id);
    const user = await createUser(organization.id, 'ChildUser');

    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: child.id, userId: user.id, isPrimary: true },
      null,
    );

    const beforeOldParent = await departmentsService.getDepartment(oldParent.id, organization.id);
    expect(beforeOldParent.subtreeUserCount).toBe(1);

    await departmentsService.moveDepartment(child.id, organization.id, { parentId: newParent.id }, null);

    const [afterOldParent, afterNewParent, reloadedChild] = await Promise.all([
      departmentsService.getDepartment(oldParent.id, organization.id),
      departmentsService.getDepartment(newParent.id, organization.id),
      departmentsService.getDepartment(child.id, organization.id),
    ]);
    expect(afterOldParent.subtreeUserCount).toBe(0);
    expect(afterNewParent.subtreeUserCount).toBe(1);
    // The child itself keeps direct/subtree membership regardless of which parent it's under.
    expect(reloadedChild.directUserCount).toBe(1);
    expect(reloadedChild.subtreeUserCount).toBe(1);
  });

  it('batches headcounts for a lazily-loaded children page in one pair of raw queries', async () => {
    const organization = await createOrganization();
    const root = await createDepartment(organization.id, 'Root');
    const childA = await createDepartment(organization.id, 'Child A', root.id);
    const childB = await createDepartment(organization.id, 'Child B', root.id);
    const userA = await createUser(organization.id, 'UserA');
    const userB = await createUser(organization.id, 'UserB');

    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: childA.id, userId: userA.id, isPrimary: true },
      null,
    );
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: childB.id, userId: userB.id, isPrimary: true },
      null,
    );

    const querySpy = jest.spyOn(prisma, '$queryRaw');
    const children = await departmentsService.getChildren(root.id, organization.id);
    // One call for direct headcounts, one for subtree headcounts -- never one per child.
    expect(querySpy).toHaveBeenCalledTimes(2);
    querySpy.mockRestore();

    const byId = new Map(children.map((department) => [department.id, department]));
    expect(byId.get(childA.id)).toMatchObject({ directUserCount: 1, subtreeUserCount: 1 });
    expect(byId.get(childB.id)).toMatchObject({ directUserCount: 1, subtreeUserCount: 1 });
  });
});

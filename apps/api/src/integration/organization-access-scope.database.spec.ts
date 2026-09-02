/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentManagersService } from '../modules/department-managers/department-managers.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { DepartmentsService } from '../modules/departments/departments.service.js';
import { GroupsService } from '../modules/groups/groups.service.js';
import { unrestrictedActor } from '../modules/manager-team-scope/public.js';
import { ManagerService } from '../modules/manager/manager.service.js';
import { OrganizationAccessScopeService } from '../modules/organization-access-scope/public.js';
import { ReportsService } from '../modules/reports/reports.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;

/**
 * PR 278 authorization regression matrix: exercises OrganizationAccessScopeService,
 * ManagerService.getTeamSummary, and ReportsService.getSummary's department filter against
 * real Postgres with two tenants, verifying every "Критерии готовности" bullet from the plan:
 * DepartmentManager alone doesn't grant RBAC manager, DIRECT+manager gives exactly the managed
 * subtree, FUNCTIONAL never extends scope, sibling branches and foreign tenants stay closed,
 * ManagerGroup scope is preserved and deduped against Department scope, an additional
 * (non-primary) membership never extends scope, and Department direct/subtree reports work
 * while filterless reports are unaffected.
 */
describe('organization access scope (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as PrismaServiceType;
  const departmentsService = new DepartmentsService(typedPrisma);
  const membershipsService = new DepartmentMembershipsService(typedPrisma);
  const departmentManagersService = new DepartmentManagersService(typedPrisma);
  const groupsService = new GroupsService(typedPrisma);
  const managerService = new ManagerService(typedPrisma);
  const reportsService = new ReportsService(typedPrisma);
  const scopeService = new OrganizationAccessScopeService(typedPrisma);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.managerGroup.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.groupMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.group.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.progress.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.course.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentManager.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization(label: string) {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org access scope ${label} ${suffix}`, slug: `org-access-scope-${label}-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser(organizationId: string, label: string) {
    return prisma.user.create({
      data: {
        organizationId,
        email: `${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Test',
        lastName: label,
      },
    });
  }

  async function createDepartment(organizationId: string, name: string, parentId?: string) {
    return departmentsService.createDepartment(
      { organizationId, name, parentId, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('DepartmentManager alone does not grant RBAC manager -- a non-manager role sees no scope regardless of DIRECT rows', async () => {
    const organization = await createOrganization('rbac');
    const department = await createDepartment(organization.id, 'Root');
    const actor = await createUser(organization.id, 'Instructor');
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: department.id, userId: actor.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const where = await scopeService.user({ id: actor.id, organizationId: organization.id, roles: ['instructor'] });
    expect(where).toEqual({});
  });

  it('grants exactly the managed subtree to a DIRECT manager, closes sibling branches, and never extends scope via FUNCTIONAL or an additional membership', async () => {
    const organization = await createOrganization('subtree');
    const root = await createDepartment(organization.id, 'Root');
    const child = await createDepartment(organization.id, 'Child', root.id);
    const sibling = await createDepartment(organization.id, 'Sibling');

    const manager = await createUser(organization.id, 'Manager');
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: root.id, userId: manager.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const rootUser = await createUser(organization.id, 'RootUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: root.id, userId: rootUser.id, isPrimary: true }, null);
    const childUser = await createUser(organization.id, 'ChildUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: child.id, userId: childUser.id, isPrimary: true }, null);
    const siblingUser = await createUser(organization.id, 'SiblingUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: sibling.id, userId: siblingUser.id, isPrimary: true }, null);

    // Additional (non-primary) membership in the managed subtree must not extend scope.
    const additionalOnlyUser = await createUser(organization.id, 'AdditionalOnly');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: sibling.id, userId: additionalOnlyUser.id, isPrimary: true }, null);
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: root.id, userId: additionalOnlyUser.id, isPrimary: false }, null);

    // A FUNCTIONAL manager of the sibling department must not gain any scope.
    const functionalManager = await createUser(organization.id, 'FunctionalManager');
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: sibling.id, userId: functionalManager.id, type: 'FUNCTIONAL', isPrimary: true },
      null,
    );

    const managerActor = { id: manager.id, organizationId: organization.id, roles: ['manager'] as const };
    const summary = await managerService.getTeamSummary(managerActor);
    const memberIds = summary.members.map((member) => member.userId).sort();
    expect(memberIds).toEqual([childUser.id, rootUser.id].sort());
    expect(memberIds).not.toContain(siblingUser.id);
    expect(memberIds).not.toContain(additionalOnlyUser.id);

    const functionalActor = { id: functionalManager.id, organizationId: organization.id, roles: ['manager'] as const };
    const functionalSummary = await managerService.getTeamSummary(functionalActor);
    expect(functionalSummary.members).toEqual([]);
  });

  it('closes the foreign tenant even for a user id that is a DIRECT manager in another organization', async () => {
    const organizationA = await createOrganization('tenant-a');
    const organizationB = await createOrganization('tenant-b');
    const departmentA = await createDepartment(organizationA.id, 'DeptA');
    const departmentB = await createDepartment(organizationB.id, 'DeptB');

    const managerA = await createUser(organizationA.id, 'ManagerA');
    await departmentManagersService.createManager(
      { organizationId: organizationA.id, departmentId: departmentA.id, userId: managerA.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const userA = await createUser(organizationA.id, 'UserA');
    await membershipsService.createMembership({ organizationId: organizationA.id, departmentId: departmentA.id, userId: userA.id, isPrimary: true }, null);
    const userB = await createUser(organizationB.id, 'UserB');
    await membershipsService.createMembership({ organizationId: organizationB.id, departmentId: departmentB.id, userId: userB.id, isPrimary: true }, null);

    const managerActor = { id: managerA.id, organizationId: organizationA.id, roles: ['manager'] as const };
    const summary = await managerService.getTeamSummary(managerActor);
    const memberIds = summary.members.map((member) => member.userId);
    expect(memberIds).toEqual([userA.id]);
    expect(memberIds).not.toContain(userB.id);

    // Requesting organizationB's department while scoped to organizationA must never leak in --
    // the scope service itself is always keyed off the actor's own organizationId.
    const crossTenantScope = await scopeService.managedDepartmentIds({ id: managerA.id, organizationId: organizationB.id, roles: ['manager'] });
    expect(crossTenantScope).toEqual([]);
  });

  it('preserves and dedupes ManagerGroup scope union with Department scope', async () => {
    const organization = await createOrganization('union');
    const department = await createDepartment(organization.id, 'Root');
    const manager = await createUser(organization.id, 'Manager');
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: department.id, userId: manager.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const group = await groupsService.createGroup({ organizationId: organization.id, name: 'Group', slug: `group-${randomUUID()}` }, null);
    await groupsService.addManager(group.id, organization.id, { managerId: manager.id }, unrestrictedActor(organization.id));

    // In both Group and Department scope -- must appear exactly once, not twice.
    const overlapUser = await createUser(organization.id, 'Overlap');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: department.id, userId: overlapUser.id, isPrimary: true }, null);
    await groupsService.addMember(group.id, organization.id, { userId: overlapUser.id }, unrestrictedActor(organization.id));

    // Group-only user, no department membership at all.
    const groupOnlyUser = await createUser(organization.id, 'GroupOnly');
    await groupsService.addMember(group.id, organization.id, { userId: groupOnlyUser.id }, unrestrictedActor(organization.id));

    const managerActor = { id: manager.id, organizationId: organization.id, roles: ['manager'] as const };
    const summary = await managerService.getTeamSummary(managerActor);
    const memberIds = summary.members.map((member) => member.userId);
    expect(memberIds.filter((id) => id === overlapUser.id)).toHaveLength(1);
    expect(memberIds.sort()).toEqual([groupOnlyUser.id, overlapUser.id].sort());
  });

  it('Department direct/subtree reports work with the departmentId filter, while filterless reports stay unaffected', async () => {
    const organization = await createOrganization('reports');
    const root = await createDepartment(organization.id, 'Root');
    const child = await createDepartment(organization.id, 'Child', root.id);
    const sibling = await createDepartment(organization.id, 'Sibling');

    const manager = await createUser(organization.id, 'Manager');
    await departmentManagersService.createManager(
      { organizationId: organization.id, departmentId: root.id, userId: manager.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    const rootUser = await createUser(organization.id, 'RootUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: root.id, userId: rootUser.id, isPrimary: true }, null);
    const childUser = await createUser(organization.id, 'ChildUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: child.id, userId: childUser.id, isPrimary: true }, null);
    const siblingUser = await createUser(organization.id, 'SiblingUser');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: sibling.id, userId: siblingUser.id, isPrimary: true }, null);

    const course = await prisma.course.create({
      data: { organizationId: organization.id, title: `Course ${randomUUID()}`, slug: `course-${randomUUID()}`, status: 'published' },
    });
    await prisma.progress.createMany({
      data: [rootUser, childUser, siblingUser].map((user) => ({
        organizationId: organization.id,
        userId: user.id,
        courseId: course.id,
        status: 'in_progress' as const,
      })),
    });

    const managerActor = { id: manager.id, organizationId: organization.id, roles: ['manager'] as const };

    const directOnly = await reportsService.getSummary(managerActor, { departmentId: root.id, includeDescendants: false });
    const directOnlyUserIds = directOnly.progress.map((row) => row.user.id).sort();
    expect(directOnlyUserIds).toEqual([rootUser.id]);

    const subtree = await reportsService.getSummary(managerActor, { departmentId: root.id, includeDescendants: true });
    const subtreeUserIds = subtree.progress.map((row) => row.user.id).sort();
    expect(subtreeUserIds).toEqual([childUser.id, rootUser.id].sort());

    // Sibling department is outside this manager's scope: filtering by it must resolve to an
    // empty population (INTERSECT), never an error and never sibling users.
    const siblingFiltered = await reportsService.getSummary(managerActor, { departmentId: sibling.id, includeDescendants: false });
    expect(siblingFiltered.progress).toEqual([]);

    // Filterless reports are unaffected by PR 278: an admin sees the whole tenant either way.
    const adminActor = { id: 'admin-actor', organizationId: organization.id, roles: ['admin'] as const };
    const adminNoFilter = await reportsService.getSummary(adminActor);
    expect(adminNoFilter.progress.map((row) => row.user.id).sort()).toEqual([childUser.id, rootUser.id, siblingUser.id].sort());
  });

  it('rejects a departmentId that does not belong to the tenant with a 404, not a leak', async () => {
    const organization = await createOrganization('missing-dept');
    const adminActor = { id: 'admin-actor', organizationId: organization.id, roles: ['admin'] as const };

    await expect(
      reportsService.getSummary(adminActor, { departmentId: randomUUID(), includeDescendants: false }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

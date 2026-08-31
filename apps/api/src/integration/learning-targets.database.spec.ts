/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { AssignmentsService } from '../modules/assignments/assignments.service.js';
import { createAssignmentSchema } from '../modules/assignments/assignments.schemas.js';
import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { GroupsService } from '../modules/groups/groups.service.js';
import { unrestrictedActor } from '../modules/manager-team-scope/public.js';
import { LearningTargetResolverService } from '../modules/learning-targets/learning-target-resolver.service.js';
import { PositionCoursesService } from '../modules/position-courses/position-courses.service.js';
import { PositionsService } from '../modules/positions/positions.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

type PrismaServiceType = import('../database/prisma.service.js').PrismaService;

/**
 * Exercises PR 277's Department/Position learning-targeting against real Postgres: the
 * exactly-one-target and includeDescendants-requires-departmentId CHECK constraints, real
 * recursive-CTE subtree matching (isSelfOrDescendant) rather than a mocked boolean, reparent
 * changing a department-target audience, additional-membership exclusion, PositionCourse
 * uniqueness, and that removing one entitlement source never revokes another. See
 * learning-target-resolver.service.spec.ts / learning-target-resolver.types.spec.ts and
 * assignments.service.spec.ts for exhaustive branch-level validation against a mocked Prisma.
 */
describe('learning targets (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as PrismaServiceType;
  const departmentsService = new DepartmentsService(typedPrisma);
  const membershipsService = new DepartmentMembershipsService(typedPrisma);
  const positionsService = new PositionsService(typedPrisma);
  const positionCoursesService = new PositionCoursesService(typedPrisma);
  const groupsService = new GroupsService(typedPrisma);
  const assignmentsService = new AssignmentsService(typedPrisma);
  const resolver = new LearningTargetResolverService(typedPrisma);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.positionCourse.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.assignment.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.groupMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.group.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.position.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.course.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Learning targets ${suffix}`, slug: `learning-targets-${suffix}` },
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

  async function createCourse(organizationId: string, options: { selfEnrollmentEnabled?: boolean } = {}) {
    const suffix = randomUUID();
    return prisma.course.create({
      data: {
        organizationId,
        title: `Course ${suffix}`,
        slug: `course-${suffix}`,
        status: 'published',
        selfEnrollmentEnabled: options.selfEnrollmentEnabled ?? false,
      },
    });
  }

  async function createDepartment(organizationId: string, name: string, parentId?: string) {
    return departmentsService.createDepartment(
      { organizationId, name, parentId, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('resolves a DIRECT_ASSIGNMENT and a GROUP source, each independently', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Direct');
    const course = await createCourse(organization.id);

    await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, userId: user.id, includeDescendants: false }));

    const direct = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(direct.sources).toEqual([expect.objectContaining({ type: 'DIRECT_ASSIGNMENT', requirement: 'REQUIRED' })]);

    const group = await groupsService.createGroup({ organizationId: organization.id, name: 'Group', slug: `group-${randomUUID()}` }, null);
    const otherUser = await createUser(organization.id, 'GroupMember');
    await groupsService.addMember(group.id, organization.id, { userId: otherUser.id }, unrestrictedActor(organization.id));
    await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, groupId: group.id, includeDescendants: false }));

    const viaGroup = await resolver.resolveForUser(organization.id, otherUser.id, course.id);
    expect(viaGroup.sources).toEqual([expect.objectContaining({ type: 'GROUP', requirement: 'REQUIRED' })]);
  });

  it('matches a direct department target only for a current active primary membership, never an additional one', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const department = await createDepartment(organization.id, 'Engineering');
    const otherDepartment = await createDepartment(organization.id, 'Sales');

    await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, departmentId: department.id, includeDescendants: false }));

    const primaryUser = await createUser(organization.id, 'Primary');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: department.id, userId: primaryUser.id, isPrimary: true }, null);
    const primaryResolution = await resolver.resolveForUser(organization.id, primaryUser.id, course.id);
    expect(primaryResolution.sources).toEqual([expect.objectContaining({ type: 'DEPARTMENT' })]);

    const additionalOnlyUser = await createUser(organization.id, 'AdditionalOnly');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: otherDepartment.id, userId: additionalOnlyUser.id, isPrimary: true }, null);
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: department.id, userId: additionalOnlyUser.id, isPrimary: false }, null);
    const additionalOnlyResolution = await resolver.resolveForUser(organization.id, additionalOnlyUser.id, course.id);
    expect(additionalOnlyResolution.isEntitled).toBe(false);
  });

  it('includeDescendants matches the current subtree, and reparenting changes the audience', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const root = await createDepartment(organization.id, 'Root');
    const otherRoot = await createDepartment(organization.id, 'OtherRoot');
    const child = await createDepartment(organization.id, 'Child', root.id);
    const user = await createUser(organization.id, 'Subtree');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: child.id, userId: user.id, isPrimary: true }, null);

    await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, departmentId: root.id, includeDescendants: true }));

    const beforeMove = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(beforeMove.isEntitled).toBe(true);

    // Reparent the child out from under root -- plan invariant: includeDescendants is dynamic,
    // so the audience must shrink immediately without touching the Assignment row itself.
    await departmentsService.moveDepartment(child.id, organization.id, { parentId: otherRoot.id }, null);

    const afterMove = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(afterMove.isEntitled).toBe(false);
  });

  it('resolves a POSITION source with dueAt computed from the membership effectiveFrom', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const department = await createDepartment(organization.id, 'Dept');
    const position = await positionsService.createPosition({ organizationId: organization.id, code: 'eng-lead', title: 'Engineering Lead' }, null);
    await positionCoursesService.createPositionCourse(
      { organizationId: organization.id, positionId: position.id, courseId: course.id, requirement: 'OPTIONAL', dueDays: 14 },
      null,
    );

    const user = await createUser(organization.id, 'Positioned');
    const membership = await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: user.id, isPrimary: true, positionId: position.id },
      null,
    );

    const resolution = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(resolution.sources).toEqual([
      expect.objectContaining({
        type: 'POSITION',
        requirement: 'OPTIONAL',
        dueAt: new Date(membership.effectiveFrom.getTime() + 14 * 86_400_000),
      }),
    ]);
  });

  it('rejects a duplicate PositionCourse for the same (organization, position, course)', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const position = await positionsService.createPosition({ organizationId: organization.id, code: 'dup-code', title: 'Dup' }, null);

    await positionCoursesService.createPositionCourse({ organizationId: organization.id, positionId: position.id, courseId: course.id, requirement: 'REQUIRED' }, null);

    await expect(
      positionCoursesService.createPositionCourse({ organizationId: organization.id, positionId: position.id, courseId: course.id, requirement: 'OPTIONAL' }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('keeps entitlement when one source is removed but another still grants access', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const user = await createUser(organization.id, 'Overlap');
    const department = await createDepartment(organization.id, 'Overlap Dept');
    await membershipsService.createMembership({ organizationId: organization.id, departmentId: department.id, userId: user.id, isPrimary: true }, null);

    const direct = await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, userId: user.id, includeDescendants: false }));
    await assignmentsService.createAssignment(createAssignmentSchema.parse({ organizationId: organization.id, courseId: course.id, departmentId: department.id, includeDescendants: false }));

    const withBoth = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(withBoth.sources).toHaveLength(2);

    await assignmentsService.updateAssignmentStatus(direct.id, organization.id, 'cancelled');

    const afterCancel = await resolver.resolveForUser(organization.id, user.id, course.id);
    expect(afterCancel.isEntitled).toBe(true);
    expect(afterCancel.sources).toEqual([expect.objectContaining({ type: 'DEPARTMENT' })]);
  });

  it('enforces the exactly-one-target and includeDescendants-requires-departmentId CHECK constraints at the DB level', async () => {
    const organization = await createOrganization();
    const course = await createCourse(organization.id);
    const user = await createUser(organization.id, 'Constraint');

    await expect(
      prisma.$executeRaw`INSERT INTO "assignments" ("id", "organization_id", "course_id", "user_id", "group_id", "status", "created_at", "updated_at")
        VALUES (gen_random_uuid(), ${organization.id}::uuid, ${course.id}::uuid, NULL, NULL, 'assigned', now(), now())`,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`INSERT INTO "assignments" ("id", "organization_id", "course_id", "user_id", "include_descendants", "status", "created_at", "updated_at")
        VALUES (gen_random_uuid(), ${organization.id}::uuid, ${course.id}::uuid, ${user.id}::uuid, true, 'assigned', now(), now())`,
    ).rejects.toThrow();
  });
});

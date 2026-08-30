/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the two real Postgres partial unique indexes (at most one current primary per
 * user; at most one current membership per user+department) and real Serializable-transaction
 * concurrency behavior that a mocked-Prisma unit test cannot meaningfully cover. See
 * department-memberships.service.spec.ts for exhaustive branch-level validation coverage.
 */
describe('department memberships (database)', () => {
  const prisma = new PrismaClient();
  const departmentsService = new DepartmentsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const service = new DepartmentMembershipsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
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
      data: { name: `Department memberships ${suffix}`, slug: `department-memberships-${suffix}` },
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
        firstName: 'Membership',
        lastName: label,
      },
    });
  }

  async function createDepartment(organizationId: string, name: string) {
    return departmentsService.createDepartment(
      { organizationId, name, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('rejects a second current primary membership for the same user', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Primary');
    const deptA = await createDepartment(organization.id, 'Dept A');
    const deptB = await createDepartment(organization.id, 'Dept B');

    await service.createMembership({ organizationId: organization.id, departmentId: deptA.id, userId: user.id, isPrimary: true }, null);

    await expect(
      service.createMembership({ organizationId: organization.id, departmentId: deptB.id, userId: user.id, isPrimary: true }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a duplicate current membership in the same department (additional or primary)', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Duplicate');
    const department = await createDepartment(organization.id, 'Dept');

    await service.createMembership({ organizationId: organization.id, departmentId: department.id, userId: user.id, isPrimary: false }, null);

    await expect(
      service.createMembership({ organizationId: organization.id, departmentId: department.id, userId: user.id, isPrimary: false }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows an additional membership alongside a primary one, and closing it does not disturb the primary', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Additional');
    const primaryDept = await createDepartment(organization.id, 'Primary dept');
    const additionalDept = await createDepartment(organization.id, 'Additional dept');

    const primary = await service.createMembership(
      { organizationId: organization.id, departmentId: primaryDept.id, userId: user.id, isPrimary: true },
      null,
    );
    const additional = await service.createMembership(
      { organizationId: organization.id, departmentId: additionalDept.id, userId: user.id, isPrimary: false },
      null,
    );

    await service.closeMembership(additional.id, organization.id, null);

    const current = await service.listUserMemberships(user.id, organization.id);
    const currentPrimary = current.find((m) => m.id === primary.id);
    expect(currentPrimary?.effectiveTo).toBeNull();
  });

  it('transfer closes the old primary and opens a new one, preserving history', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Transfer');
    const fromDept = await createDepartment(organization.id, 'From');
    const toDept = await createDepartment(organization.id, 'To');

    const original = await service.createMembership(
      { organizationId: organization.id, departmentId: fromDept.id, userId: user.id, isPrimary: true },
      null,
    );
    const transferred = await service.transferPrimaryDepartment(user.id, organization.id, { departmentId: toDept.id }, null);

    const history = await service.listUserMemberships(user.id, organization.id);
    const closedOriginal = history.find((m) => m.id === original.id);
    const newPrimary = history.find((m) => m.id === transferred.id);
    expect(closedOriginal?.effectiveTo).not.toBeNull();
    expect(newPrimary?.effectiveTo).toBeNull();
    expect(newPrimary?.isPrimary).toBe(true);
    expect(history).toHaveLength(2);
  });

  it('bulk transfer moves every listed user atomically', async () => {
    const organization = await createOrganization();
    const [userA, userB] = await Promise.all([createUser(organization.id, 'BulkA'), createUser(organization.id, 'BulkB')]);
    const fromDept = await createDepartment(organization.id, 'Bulk from');
    const toDept = await createDepartment(organization.id, 'Bulk to');

    await Promise.all([
      service.createMembership({ organizationId: organization.id, departmentId: fromDept.id, userId: userA.id, isPrimary: true }, null),
      service.createMembership({ organizationId: organization.id, departmentId: fromDept.id, userId: userB.id, isPrimary: true }, null),
    ]);

    await service.bulkTransfer(toDept.id, organization.id, { userIds: [userA.id, userB.id] }, null);

    const usersInTarget = await service.listDepartmentUsers(toDept.id, organization.id);
    expect(usersInTarget.map((m) => m.userId).sort()).toEqual([userA.id, userB.id].sort());
  });

  it('never lets two concurrent transfers for the same user create two current primaries', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Race');
    const deptA = await createDepartment(organization.id, 'Race A');
    const deptB = await createDepartment(organization.id, 'Race B');
    const deptC = await createDepartment(organization.id, 'Race C');

    await service.createMembership({ organizationId: organization.id, departmentId: deptA.id, userId: user.id, isPrimary: true }, null);

    const results = await Promise.allSettled([
      service.transferPrimaryDepartment(user.id, organization.id, { departmentId: deptB.id }, null),
      service.transferPrimaryDepartment(user.id, organization.id, { departmentId: deptC.id }, null),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    // Both may legitimately succeed if they serialize one after another (the second transfer
    // simply supersedes the first) -- what must never happen is more than one CURRENT primary.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const currentPrimaries = await prisma.departmentMembership.findMany({
      where: { organizationId: organization.id, userId: user.id, isPrimary: true, effectiveTo: null },
    });
    expect(currentPrimaries).toHaveLength(1);
  }, 30_000);
});

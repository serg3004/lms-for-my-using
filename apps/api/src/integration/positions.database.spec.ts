/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { PositionsService } from '../modules/positions/positions.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the real Postgres UNIQUE(organizationId, code) constraint, archive/restore
 * transitions, and the plan invariant that an archived Position stays valid in history but
 * cannot be newly assigned -- none of which a mocked-Prisma unit test can meaningfully cover.
 * See positions.service.spec.ts and department-memberships.service.spec.ts for exhaustive
 * branch-level validation.
 */
describe('positions (database)', () => {
  const prisma = new PrismaClient();
  const departmentsService = new DepartmentsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const membershipsService = new DepartmentMembershipsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const service = new PositionsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentMembership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.position.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Positions ${suffix}`, slug: `positions-${suffix}` },
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

  async function createDepartment(organizationId: string, name: string) {
    return departmentsService.createDepartment(
      { organizationId, name, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('rejects a duplicate code within the same tenant but allows it across tenants', async () => {
    const organization = await createOrganization();
    const otherOrganization = await createOrganization();

    await service.createPosition({ organizationId: organization.id, code: 'eng-lead', title: 'Engineering Lead' }, null);

    await expect(
      service.createPosition({ organizationId: organization.id, code: 'eng-lead', title: 'Duplicate' }, null),
    ).rejects.toMatchObject({ status: 409 });

    const otherTenantPosition = await service.createPosition(
      { organizationId: otherOrganization.id, code: 'eng-lead', title: 'Engineering Lead' },
      null,
    );
    expect(otherTenantPosition.code).toBe('eng-lead');
  });

  it('archives and restores a position, clearing archivedAt on restore', async () => {
    const organization = await createOrganization();
    const position = await service.createPosition({ organizationId: organization.id, code: 'archivable', title: 'Archivable' }, null);

    const archived = await service.archivePosition(position.id, organization.id, null);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).not.toBeNull();

    const restored = await service.restorePosition(position.id, organization.id, null);
    expect(restored.status).toBe('active');
    expect(restored.archivedAt).toBeNull();
  });

  it('keeps a historical membership assignment intact after its position is archived, but rejects assigning that archived position to a new membership', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Historical');
    const department = await createDepartment(organization.id, 'Dept');
    const position = await service.createPosition({ organizationId: organization.id, code: 'to-archive', title: 'To Archive' }, null);

    const membership = await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: user.id, isPrimary: true, positionId: position.id },
      null,
    );
    expect(membership.positionId).toBe(position.id);

    await service.archivePosition(position.id, organization.id, null);

    const memberships = await membershipsService.listUserMemberships(user.id, organization.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.positionId).toBe(position.id);

    const otherUser = await createUser(organization.id, 'Blocked');
    await expect(
      membershipsService.createMembership(
        { organizationId: organization.id, departmentId: department.id, userId: otherUser.id, isPrimary: true, positionId: position.id },
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

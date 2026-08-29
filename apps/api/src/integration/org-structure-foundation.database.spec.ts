/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { assertSafeTestDatabase } from './database-test-safety.js';

describe('organization structure database foundation', () => {
  const prisma = new PrismaClient();
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Org structure ${suffix}`, slug: `org-structure-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  it('stores tenant-configurable types, optional typing, hierarchy defaults, and event metadata', async () => {
    const organization = await createOrganization();
    const departmentType = await prisma.departmentType.create({
      data: { organizationId: organization.id, code: 'division', name: 'Division', sortOrder: 10 },
    });
    const root = await prisma.department.create({
      data: {
        organizationId: organization.id,
        departmentTypeId: departmentType.id,
        name: 'Head office',
        code: 'head-office',
      },
    });
    const untypedChild = await prisma.department.create({
      data: { organizationId: organization.id, parentId: root.id, name: 'Temporary unit' },
    });
    const event = await prisma.orgStructureEvent.create({
      data: {
        organizationId: organization.id,
        entityType: 'DEPARTMENT',
        entityId: root.id,
        eventType: 'CREATED',
        operationId: randomUUID(),
        metadata: { source: 'database-test' },
      },
    });

    expect(departmentType.isActive).toBe(true);
    expect(untypedChild.departmentTypeId).toBeNull();
    expect(untypedChild.directManagerMode).toBe('LOCAL');
    expect(untypedChild.functionalManagerMode).toBe('LOCAL');
    expect(event.metadata).toEqual({ source: 'database-test' });
  });

  it('enforces tenant/code uniqueness while allowing multiple null department codes', async () => {
    const organization = await createOrganization();
    await prisma.departmentType.create({
      data: { organizationId: organization.id, code: 'team', name: 'Team' },
    });
    await expect(
      prisma.departmentType.create({
        data: { organizationId: organization.id, code: 'team', name: 'Duplicate team' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.department.createMany({
      data: [
        { organizationId: organization.id, name: 'No code one' },
        { organizationId: organization.id, name: 'No code two' },
        { organizationId: organization.id, name: 'Unique code', code: 'unique' },
      ],
    });
    await expect(
      prisma.department.create({
        data: { organizationId: organization.id, name: 'Duplicate code', code: 'unique' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects self-parenting and cross-tenant hierarchy, type, and actor relations', async () => {
    const first = await createOrganization();
    const second = await createOrganization();
    const foreignType = await prisma.departmentType.create({
      data: { organizationId: second.id, code: 'foreign', name: 'Foreign type' },
    });
    const foreignParent = await prisma.department.create({
      data: { organizationId: second.id, name: 'Foreign parent' },
    });
    const localDepartment = await prisma.department.create({
      data: { organizationId: first.id, name: 'Local department' },
    });
    const foreignActor = await prisma.user.create({
      data: {
        organizationId: second.id,
        email: `${randomUUID()}@example.test`,
        passwordHash: 'not-used-in-this-database-test',
        firstName: 'Foreign',
        lastName: 'Actor',
      },
    });

    await expect(
      prisma.department.update({ where: { id: localDepartment.id }, data: { parentId: localDepartment.id } }),
    ).rejects.toBeDefined();
    await expect(
      prisma.department.update({ where: { id: localDepartment.id }, data: { parentId: foreignParent.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.department.update({ where: { id: localDepartment.id }, data: { departmentTypeId: foreignType.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.orgStructureEvent.create({
        data: {
          organizationId: first.id,
          actorId: foreignActor.id,
          entityType: 'DEPARTMENT',
          eventType: 'UPDATED',
          operationId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

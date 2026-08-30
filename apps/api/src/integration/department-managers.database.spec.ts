/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentManagersService } from '../modules/department-managers/department-managers.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the two real Postgres partial unique indexes (at most one current manager per
 * department+user+type; at most one current primary per department+type), real INHERIT/MERGE
 * tree computation against real recursive-CTE ancestor lookups, and the mode-switch guard --
 * none of which a mocked-Prisma unit test can meaningfully cover. See
 * department-managers.service.spec.ts and effective-managers.spec.ts for exhaustive
 * branch-level validation and DP-logic coverage.
 */
describe('department managers (database)', () => {
  const prisma = new PrismaClient();
  const departmentsService = new DepartmentsService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const service = new DepartmentManagersService(prisma as unknown as import('../database/prisma.service.js').PrismaService);
  const organizationIds: string[] = [];

  beforeAll(() => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });
  });

  afterAll(async () => {
    await prisma.orgStructureEvent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.departmentManager.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function createOrganization() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: `Department managers ${suffix}`, slug: `department-managers-${suffix}` },
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
        firstName: 'Manager',
        lastName: label,
      },
    });
  }

  async function createDepartment(
    organizationId: string,
    name: string,
    options: { parentId?: string; directManagerMode?: 'LOCAL' | 'INHERIT' | 'MERGE'; functionalManagerMode?: 'LOCAL' | 'INHERIT' | 'MERGE' } = {},
  ) {
    return departmentsService.createDepartment(
      {
        organizationId,
        name,
        sortOrder: 0,
        parentId: options.parentId,
        directManagerMode: options.directManagerMode ?? 'LOCAL',
        functionalManagerMode: options.functionalManagerMode ?? 'LOCAL',
      },
      null,
    );
  }

  it('rejects a duplicate current (department, user, type) manager', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Duplicate');
    const department = await createDepartment(organization.id, 'Dept');

    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'DIRECT', isPrimary: false }, null);

    await expect(
      service.createManager({ organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'DIRECT', isPrimary: false }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same user as manager of a different type in the same department', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'BothTypes');
    const department = await createDepartment(organization.id, 'Dept');

    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'DIRECT', isPrimary: false }, null);
    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'FUNCTIONAL', isPrimary: false }, null);

    const effective = await service.listEffectiveManagers(department.id, organization.id);
    expect(effective.map((m) => m.type).sort()).toEqual(['DIRECT', 'FUNCTIONAL']);
  });

  it('rejects a second current primary manager of the same type in the same department', async () => {
    const organization = await createOrganization();
    const [userA, userB] = await Promise.all([createUser(organization.id, 'PrimaryA'), createUser(organization.id, 'PrimaryB')]);
    const department = await createDepartment(organization.id, 'Dept');

    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: userA.id, type: 'DIRECT', isPrimary: true }, null);

    await expect(
      service.createManager({ organizationId: organization.id, departmentId: department.id, userId: userB.id, type: 'DIRECT', isPrimary: true }, null),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('a manager relation does not require Department membership', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'NoMembership');
    const department = await createDepartment(organization.id, 'Dept');

    const manager = await service.createManager(
      { organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    expect(manager.userId).toBe(user.id);
  });

  it('supports several DIRECT and FUNCTIONAL managers locally', async () => {
    const organization = await createOrganization();
    const [directA, directB, functional] = await Promise.all([
      createUser(organization.id, 'DirectA'),
      createUser(organization.id, 'DirectB'),
      createUser(organization.id, 'Functional'),
    ]);
    const department = await createDepartment(organization.id, 'Dept');

    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: directA.id, type: 'DIRECT', isPrimary: true }, null);
    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: directB.id, type: 'DIRECT', isPrimary: false }, null);
    await service.createManager({ organizationId: organization.id, departmentId: department.id, userId: functional.id, type: 'FUNCTIONAL', isPrimary: true }, null);

    const effective = await service.listEffectiveManagers(department.id, organization.id);
    expect(effective.filter((m) => m.type === 'DIRECT')).toHaveLength(2);
    expect(effective.filter((m) => m.type === 'FUNCTIONAL')).toHaveLength(1);
    expect(effective.every((m) => m.source === 'LOCAL')).toBe(true);
  });

  it('INHERIT resolves through three levels to the nearest ancestor with managers', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'Grandparent');
    const grandparent = await createDepartment(organization.id, 'Grandparent', { directManagerMode: 'LOCAL' });
    const parent = await createDepartment(organization.id, 'Parent', { parentId: grandparent.id, directManagerMode: 'INHERIT' });
    const child = await createDepartment(organization.id, 'Child', { parentId: parent.id, directManagerMode: 'INHERIT' });

    await service.createManager({ organizationId: organization.id, departmentId: grandparent.id, userId: user.id, type: 'DIRECT', isPrimary: true }, null);

    const effective = await service.listEffectiveManagers(child.id, organization.id);
    expect(effective).toHaveLength(1);
    expect(effective[0]).toMatchObject({ userId: user.id, source: 'INHERITED', sourceDepartmentId: grandparent.id });
  });

  it('MERGE combines local and inherited managers, local primary taking priority', async () => {
    const organization = await createOrganization();
    const [parentPrimary, localPrimary] = await Promise.all([
      createUser(organization.id, 'ParentPrimary'),
      createUser(organization.id, 'LocalPrimary'),
    ]);
    const parent = await createDepartment(organization.id, 'Parent', { directManagerMode: 'LOCAL' });
    const child = await createDepartment(organization.id, 'Child', { parentId: parent.id, directManagerMode: 'MERGE' });

    await service.createManager({ organizationId: organization.id, departmentId: parent.id, userId: parentPrimary.id, type: 'DIRECT', isPrimary: true }, null);
    await service.createManager({ organizationId: organization.id, departmentId: child.id, userId: localPrimary.id, type: 'DIRECT', isPrimary: true }, null);

    const effective = await service.listEffectiveManagers(child.id, organization.id);
    expect(effective).toHaveLength(2);
    const local = effective.find((m) => m.userId === localPrimary.id);
    const inherited = effective.find((m) => m.userId === parentPrimary.id);
    expect(local).toMatchObject({ source: 'LOCAL', isPrimary: true });
    expect(inherited).toMatchObject({ source: 'INHERITED', isPrimary: false });
  });

  it('rejects switching to INHERIT while current local managers exist, and allows it once they are closed', async () => {
    const organization = await createOrganization();
    const user = await createUser(organization.id, 'ModeSwitch');
    const department = await createDepartment(organization.id, 'Dept');

    const manager = await service.createManager(
      { organizationId: organization.id, departmentId: department.id, userId: user.id, type: 'DIRECT', isPrimary: true },
      null,
    );

    await expect(
      service.updateManagerModes(department.id, organization.id, { directManagerMode: 'INHERIT' }, null),
    ).rejects.toMatchObject({ status: 409 });

    await service.closeManager(manager.id, organization.id, null);

    const updated = await service.updateManagerModes(department.id, organization.id, { directManagerMode: 'INHERIT' }, null);
    expect(updated.directManagerMode).toBe('INHERIT');
  });

  it('never lets two concurrent primary-manager creates for the same department+type both succeed', async () => {
    const organization = await createOrganization();
    const [userA, userB] = await Promise.all([createUser(organization.id, 'RaceA'), createUser(organization.id, 'RaceB')]);
    const department = await createDepartment(organization.id, 'Race dept');

    const results = await Promise.allSettled([
      service.createManager({ organizationId: organization.id, departmentId: department.id, userId: userA.id, type: 'DIRECT', isPrimary: true }, null),
      service.createManager({ organizationId: organization.id, departmentId: department.id, userId: userB.id, type: 'DIRECT', isPrimary: true }, null),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const currentPrimaries = await prisma.departmentManager.findMany({
      where: { organizationId: organization.id, departmentId: department.id, type: 'DIRECT', isPrimary: true, effectiveTo: null },
    });
    expect(currentPrimaries).toHaveLength(1);
  }, 30_000);
});

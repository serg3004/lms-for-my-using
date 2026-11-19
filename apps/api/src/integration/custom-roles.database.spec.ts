/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { CustomRolesService } from '../modules/custom-roles/custom-roles.service.js';
import { hasPermission } from '../modules/custom-roles/effective-permissions.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 480 acceptance criteria against real Postgres: storage, uniqueness, organization isolation,
// optimistic version check and the per-organization switch.
describe('custom roles storage and effective rights — database', () => {
  let prisma: PrismaService;
  let service: CustomRolesService;
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;

  async function seedOrg(label: string) {
    const runId = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `${label} ${runId}`, slug: `${label}-${runId}` } });
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: `${label}-${runId}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: label,
        lastName: 'User',
      },
    });
    await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: 'learner' } });
    return { organizationId: organization.id, userId: user.id };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new CustomRolesService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const [a, b] = await Promise.all([seedOrg('croles-a'), seedOrg('croles-b')]);
    orgA = a.organizationId;
    userA = a.userId;
    orgB = b.organizationId;
    userB = b.userId;
  });

  it('keeps role names unique inside one organization but not across organizations', async () => {
    await service.createRole(orgA, { name: 'Auditor' });
    await expect(service.createRole(orgA, { name: 'Auditor' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createRole(orgB, { name: 'Auditor' })).resolves.toMatchObject({ name: 'Auditor' });
  });

  it('refuses a role from another organization at the database level', async () => {
    const role = await service.createRole(orgA, { name: 'Foreign' });
    await expect(
      prisma.userCustomRoleAssignment.create({ data: { organizationId: orgB, userId: userB, roleId: role.id } }),
    ).rejects.toThrow();
    await expect(service.assignRole(orgB, userB, role.id)).rejects.toThrow();
    await expect(
      prisma.customRolePermission.create({ data: { organizationId: orgB, roleId: role.id, action: 'course.read', scope: 'own' } }),
    ).rejects.toThrow();
  });

  it('rejects an invalid grant set and a concurrent edit with the old version', async () => {
    const role = await service.createRole(orgA, { name: 'Editor' });
    await expect(
      service.replacePermissions(orgA, role.id, role.version, [{ action: 'no.such.action', scope: 'own' }]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const updated = await service.replacePermissions(orgA, role.id, role.version, [{ action: 'course.read', scope: 'organization' }]);
    expect(updated.version).toBe(role.version + 1);
    expect(updated.permissions).toEqual([{ action: 'course.read', scope: 'organization' }]);
    await expect(service.replacePermissions(orgA, role.id, role.version, [])).rejects.toBeInstanceOf(ConflictException);
  });

  it('gives effective rights only while the switch is on and the role is active', async () => {
    const role = await service.createRole(orgA, { name: 'Reader' });
    await service.replacePermissions(orgA, role.id, role.version, [{ action: 'report.course.read', scope: 'organization' }]);
    await service.assignRole(orgA, userA, role.id);

    expect(hasPermission(await service.effectivePermissions(orgA, userA), 'report.course.read')).toBe(false);

    await prisma.organization.update({ where: { id: orgA }, data: { customRolesEnabled: true } });
    expect(hasPermission(await service.effectivePermissions(orgA, userA), 'report.course.read')).toBe(true);
    expect(hasPermission(await service.effectivePermissions(orgA, userA), 'course.read')).toBe(true);

    await service.revokeRole(orgA, userA, role.id);
    expect(hasPermission(await service.effectivePermissions(orgA, userA), 'report.course.read')).toBe(false);

    await service.assignRole(orgA, userA, role.id);
    await service.archiveRole(orgA, role.id, role.version + 1);
    expect(hasPermission(await service.effectivePermissions(orgA, userA), 'report.course.read')).toBe(false);
    await expect(service.assignRole(orgA, userA, role.id)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('removes the grants and assignments with the role organization', async () => {
    const role = await service.createRole(orgA, { name: 'Temp' });
    await service.replacePermissions(orgA, role.id, role.version, [{ action: 'course.read', scope: 'own' }]);
    await service.assignRole(orgA, userA, role.id);
    await prisma.customRole.delete({ where: { id: role.id } });
    expect(await prisma.customRolePermission.count({ where: { roleId: role.id } })).toBe(0);
    expect(await prisma.userCustomRoleAssignment.count({ where: { roleId: role.id } })).toBe(0);
  });
});

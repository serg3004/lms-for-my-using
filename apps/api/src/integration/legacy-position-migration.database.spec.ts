/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DepartmentsService } from '../modules/departments/departments.service.js';
import { DepartmentMembershipsService } from '../modules/department-memberships/department-memberships.service.js';
import { LegacyPositionMigrationService } from '../modules/positions/legacy-position-migration.service.js';
import { PositionsService } from '../modules/positions/positions.service.js';
import type { LegacyPositionMappingEntry } from '../modules/positions/legacy-position-migration.types.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

/**
 * Exercises the PR 276 legacy `User.position` backfill against real Postgres: dry-run writes
 * nothing, apply is idempotent (a second apply changes nothing and never duplicates the
 * OrgStructureEvent), a user without a current primary membership never gets one created for
 * them, and the original `User.position` string is never touched. See
 * legacy-position-migration.service.spec.ts for exhaustive branch-level validation against a
 * mocked Prisma.
 */
describe('legacy position migration (database)', () => {
  const prisma = new PrismaClient();
  const typedPrisma = prisma as unknown as import('../database/prisma.service.js').PrismaService;
  const departmentsService = new DepartmentsService(typedPrisma);
  const membershipsService = new DepartmentMembershipsService(typedPrisma);
  const positionsService = new PositionsService(typedPrisma);
  const service = new LegacyPositionMigrationService(typedPrisma);
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
      data: { name: `Legacy position ${suffix}`, slug: `legacy-position-${suffix}` },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser(organizationId: string, label: string, position: string | null) {
    return prisma.user.create({
      data: {
        organizationId,
        email: `${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-used-by-this-test',
        firstName: 'Test',
        lastName: label,
        position,
      },
    });
  }

  async function createDepartment(organizationId: string, name: string) {
    return departmentsService.createDepartment(
      { organizationId, name, sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      null,
    );
  }

  it('dry-run writes nothing, apply is idempotent, and a user without a department stays unresolved', async () => {
    const organization = await createOrganization();
    const department = await createDepartment(organization.id, 'Dept');
    const position = await positionsService.createPosition(
      { organizationId: organization.id, code: 'senior-dev', title: 'Senior Developer' },
      null,
    );

    const withDept = await createUser(organization.id, 'WithDept', 'Senior Developer');
    await membershipsService.createMembership(
      { organizationId: organization.id, departmentId: department.id, userId: withDept.id, isPrimary: true },
      null,
    );
    const withoutDept = await createUser(organization.id, 'WithoutDept', 'Senior Developer');

    const mapping: LegacyPositionMappingEntry[] = [{ legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-dev' }];

    const dryRunReport = await service.run(mapping, { organizationId: organization.id, dryRun: true });
    expect(dryRunReport.mapped).toBe(1);
    expect(dryRunReport.unresolved).toBe(1);

    const membershipsAfterDryRun = await membershipsService.listUserMemberships(withDept.id, organization.id);
    expect(membershipsAfterDryRun[0]?.positionId).toBeNull();
    const untouchedUser = await prisma.user.findUniqueOrThrow({ where: { id: withDept.id } });
    expect(untouchedUser.position).toBe('Senior Developer');

    const applyReport = await service.run(mapping, { organizationId: organization.id, dryRun: false });
    expect(applyReport.mapped).toBe(1);
    expect(applyReport.unresolved).toBe(1);
    const unresolvedOutcome = applyReport.outcomes.find((outcome) => outcome.userId === withoutDept.id);
    expect(unresolvedOutcome).toMatchObject({ status: 'unresolved', reason: 'no_current_primary_membership' });

    const membershipsAfterApply = await membershipsService.listUserMemberships(withDept.id, organization.id);
    expect(membershipsAfterApply[0]?.positionId).toBe(position.id);

    const withoutDeptMemberships = await membershipsService.listUserMemberships(withoutDept.id, organization.id);
    expect(withoutDeptMemberships).toHaveLength(0);

    const eventsAfterFirstApply = await prisma.orgStructureEvent.findMany({
      where: { organizationId: organization.id, eventType: 'department_membership.legacy_position_migrated' },
    });
    expect(eventsAfterFirstApply).toHaveLength(1);

    // Re-running apply must be a no-op: no duplicate event, membership unchanged, still marked "mapped".
    const secondApplyReport = await service.run(mapping, { organizationId: organization.id, dryRun: false });
    expect(secondApplyReport.outcomes.find((outcome) => outcome.userId === withDept.id)).toMatchObject({
      status: 'mapped',
      alreadyApplied: true,
    });
    const eventsAfterSecondApply = await prisma.orgStructureEvent.findMany({
      where: { organizationId: organization.id, eventType: 'department_membership.legacy_position_migrated' },
    });
    expect(eventsAfterSecondApply).toHaveLength(1);

    const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: withDept.id } });
    expect(finalUser.position).toBe('Senior Developer');
  });

  it('does not overwrite a membership that was already explicitly assigned a different Position', async () => {
    const organization = await createOrganization();
    const department = await createDepartment(organization.id, 'Dept');
    const mappedPosition = await positionsService.createPosition(
      { organizationId: organization.id, code: 'mapped-code', title: 'Mapped Title' },
      null,
    );
    const manualPosition = await positionsService.createPosition(
      { organizationId: organization.id, code: 'manual-code', title: 'Manual Title' },
      null,
    );

    const user = await createUser(organization.id, 'Manual', 'Some Legacy Title');
    await membershipsService.createMembership(
      {
        organizationId: organization.id,
        departmentId: department.id,
        userId: user.id,
        isPrimary: true,
        positionId: manualPosition.id,
      },
      null,
    );

    const mapping: LegacyPositionMappingEntry[] = [{ legacyValue: 'Some Legacy Title', action: 'map', positionCode: 'mapped-code' }];
    const report = await service.run(mapping, { organizationId: organization.id, dryRun: false });

    expect(report.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'membership_already_has_a_different_position' });
    const memberships = await membershipsService.listUserMemberships(user.id, organization.id);
    expect(memberships[0]?.positionId).toBe(manualPosition.id);
    expect(memberships[0]?.positionId).not.toBe(mappedPosition.id);
  });
});

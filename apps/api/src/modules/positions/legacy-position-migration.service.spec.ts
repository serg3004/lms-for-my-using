import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { LegacyPositionMigrationService } from './legacy-position-migration.service.js';
import type { LegacyPositionMappingEntry } from './legacy-position-migration.types.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const otherOrganizationId = '22222222-2222-2222-2222-222222222222';
const positionId = '33333333-3333-3333-3333-333333333333';
const membershipId = '44444444-4444-4444-4444-444444444444';

function createPrisma(overrides: {
  user?: Partial<Record<'findMany', jest.Mock>>;
  position?: Partial<Record<'findFirst', jest.Mock>>;
  departmentMembership?: Partial<Record<'findFirst' | 'update', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    user: {
      findMany: jest.fn(async () => []),
      ...overrides.user,
    },
    position: {
      findFirst: jest.fn(async () => ({ id: positionId, status: 'active' })),
      ...overrides.position,
    },
    departmentMembership: {
      findFirst: jest.fn(async () => ({ id: membershipId, positionId: null })),
      update: jest.fn(async () => ({})),
      ...overrides.departmentMembership,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

const mapping: LegacyPositionMappingEntry[] = [
  { legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-dev' },
  { legacyValue: 'N/A', action: 'skip', reason: 'placeholder value' },
];

describe('LegacyPositionMigrationService', () => {
  describe('buildInventoryReport', () => {
    it('groups users by normalized value with per-organization counts and mapping status', async () => {
      const findMany = jest.fn(async () => [
        { id: 'u1', organizationId, position: 'Senior Developer' },
        { id: 'u2', organizationId, position: 'senior developer' },
        { id: 'u3', organizationId: otherOrganizationId, position: 'SENIOR DEVELOPER' },
        { id: 'u4', organizationId, position: 'Intern' },
        { id: 'u5', organizationId, position: '   ' },
        { id: 'u6', organizationId, position: null },
      ]);
      const prisma = createPrisma({ user: { findMany } });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.buildInventoryReport(mapping);

      expect(report.totalNonEmptyUsers).toBe(4);
      expect(report.distinctValues).toBe(2);
      const seniorDev = report.entries.find((entry) => entry.normalizedValue === 'senior developer');
      expect(seniorDev).toMatchObject({
        rawVariants: ['SENIOR DEVELOPER', 'Senior Developer', 'senior developer'],
        totalUsers: 3,
        organizationCounts: { [organizationId]: 2, [otherOrganizationId]: 1 },
        mapping: 'mapped',
      });
      const intern = report.entries.find((entry) => entry.normalizedValue === 'intern');
      expect(intern?.mapping).toBe('unresolved');
    });
  });

  describe('run', () => {
    it('marks a value with no mapping entry as unresolved', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Mystery Title' }]);
      const prisma = createPrisma({ user: { findMany } });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping);

      expect(report.outcomes).toEqual([
        { userId: 'u1', organizationId, legacyValue: 'Mystery Title', status: 'unresolved', reason: 'no_mapping_entry' },
      ]);
      expect(report.unresolved).toBe(1);
    });

    it('marks an explicit skip entry as skipped', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'N/A' }]);
      const prisma = createPrisma({ user: { findMany } });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping);

      expect(report.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'placeholder value' });
    });

    it('marks a conflicting mapping as ambiguous', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Lead' }]);
      const prisma = createPrisma({ user: { findMany } });
      const service = new LegacyPositionMigrationService(prisma);
      const conflictingMapping: LegacyPositionMappingEntry[] = [
        { legacyValue: 'Lead', action: 'map', positionCode: 'lead' },
        { legacyValue: 'lead', action: 'map', positionCode: 'team-lead' },
      ];

      const report = await service.run(conflictingMapping);

      expect(report.outcomes[0]).toMatchObject({ status: 'ambiguous', reason: 'conflicting_mapping_entries' });
    });

    it('marks unresolved when the mapped Position code does not exist in the user organization', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const prisma = createPrisma({ user: { findMany }, position: { findFirst: jest.fn(async () => null) } });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping);

      expect(report.outcomes[0]).toMatchObject({ status: 'unresolved', reason: 'position_code_not_found_in_organization' });
    });

    it('marks unresolved when the mapped Position is archived', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const prisma = createPrisma({
        user: { findMany },
        position: { findFirst: jest.fn(async () => ({ id: positionId, status: 'archived' })) },
      });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping);

      expect(report.outcomes[0]).toMatchObject({ status: 'unresolved', reason: 'position_archived' });
    });

    it('marks unresolved when the user has no current primary membership, without creating one', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const membershipFindFirst = jest.fn(async () => null);
      const membershipCreate = jest.fn();
      const prisma = createPrisma({ user: { findMany }, departmentMembership: { findFirst: membershipFindFirst } });
      (prisma as unknown as { departmentMembership: { create: jest.Mock } }).departmentMembership.create = membershipCreate;
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping, { dryRun: false });

      expect(report.outcomes[0]).toMatchObject({ status: 'unresolved', reason: 'no_current_primary_membership' });
      expect(membershipCreate).not.toHaveBeenCalled();
    });

    it('reports already-applied as mapped without writing anything', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const update = jest.fn();
      const prisma = createPrisma({
        user: { findMany },
        departmentMembership: { findFirst: jest.fn(async () => ({ id: membershipId, positionId })), update },
      });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping, { dryRun: false });

      expect(report.outcomes[0]).toMatchObject({ status: 'mapped', alreadyApplied: true });
      expect(update).not.toHaveBeenCalled();
    });

    it('skips without overwriting a membership that already has a different Position', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const update = jest.fn();
      const prisma = createPrisma({
        user: { findMany },
        departmentMembership: { findFirst: jest.fn(async () => ({ id: membershipId, positionId: 'some-other-position' })), update },
      });
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping, { dryRun: false });

      expect(report.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'membership_already_has_a_different_position' });
      expect(update).not.toHaveBeenCalled();
    });

    it('does not write anything in dry-run mode even for a resolvable mapping', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const update = jest.fn();
      const eventCreate = jest.fn();
      const prisma = createPrisma({ user: { findMany }, departmentMembership: { update } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping, { dryRun: true });

      expect(report.outcomes[0]).toMatchObject({ status: 'mapped', alreadyApplied: false });
      expect(update).not.toHaveBeenCalled();
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('applies the mapping and records an OrgStructureEvent when not a dry run', async () => {
      const findMany = jest.fn(async () => [{ id: 'u1', organizationId, position: 'Senior Developer' }]);
      const update = jest.fn(async () => ({}));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ user: { findMany }, departmentMembership: { update } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new LegacyPositionMigrationService(prisma);

      const report = await service.run(mapping, { dryRun: false });

      expect(update).toHaveBeenCalledWith({ where: { id: membershipId }, data: { positionId } });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'department_membership.legacy_position_migrated', entityId: membershipId }),
        }),
      );
      expect(report.outcomes[0]).toMatchObject({ status: 'mapped', alreadyApplied: false, positionCode: 'senior-dev' });
    });

    it('scopes the query to a single organization when requested', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ user: { findMany } });
      const service = new LegacyPositionMigrationService(prisma);

      await service.run(mapping, { organizationId });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId }) }),
      );
    });
  });
});

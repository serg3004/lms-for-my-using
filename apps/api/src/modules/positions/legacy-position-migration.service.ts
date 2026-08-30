import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent } from '../departments/public.js';
import {
  buildMappingIndex,
  normalizeLegacyPositionValue,
  type LegacyPositionMappingEntry,
  type ResolvedMappingEntry,
} from './legacy-position-migration.types.js';

type UserWithLegacyPosition = { id: string; organizationId: string; position: string };

export type LegacyPositionInventoryEntry = {
  normalizedValue: string;
  /** Distinct raw spellings seen for this normalized value -- never merged with another value. */
  rawVariants: string[];
  totalUsers: number;
  organizationCounts: Record<string, number>;
  mapping: 'mapped' | 'skip' | 'unresolved' | 'ambiguous';
};

export type LegacyPositionInventoryReport = {
  distinctValues: number;
  totalNonEmptyUsers: number;
  entries: LegacyPositionInventoryEntry[];
};

export type LegacyPositionOutcomeStatus = 'mapped' | 'unresolved' | 'ambiguous' | 'skipped';

export type LegacyPositionOutcome = {
  userId: string;
  organizationId: string;
  legacyValue: string;
  status: LegacyPositionOutcomeStatus;
  reason?: string;
  positionCode?: string;
  /** Only meaningful for status "mapped": true if the membership already had this Position. */
  alreadyApplied?: boolean;
};

export type LegacyPositionMigrationReport = {
  dryRun: boolean;
  totalConsidered: number;
  mapped: number;
  unresolved: number;
  ambiguous: number;
  skipped: number;
  outcomes: LegacyPositionOutcome[];
};

@Injectable()
export class LegacyPositionMigrationService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadUsersWithLegacyPosition(organizationId?: string): Promise<UserWithLegacyPosition[]> {
    const users = await this.prisma.user.findMany({
      where: { position: { not: null }, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, organizationId: true, position: true },
    });
    return users
      .filter((user): user is typeof user & { position: string } => Boolean(user.position && user.position.trim()))
      .map((user) => ({ id: user.id, organizationId: user.organizationId, position: user.position }));
  }

  /** Read-only: distinct legacy values, their raw spellings, per-tenant counts, and current mapping status. */
  async buildInventoryReport(
    mapping: readonly LegacyPositionMappingEntry[],
    organizationId?: string,
  ): Promise<LegacyPositionInventoryReport> {
    const users = await this.loadUsersWithLegacyPosition(organizationId);
    const mappingIndex = buildMappingIndex(mapping);

    const groups = new Map<string, { rawVariants: Set<string>; total: number; byOrg: Map<string, number> }>();
    for (const user of users) {
      const key = normalizeLegacyPositionValue(user.position);
      const group = groups.get(key) ?? { rawVariants: new Set<string>(), total: 0, byOrg: new Map<string, number>() };
      group.rawVariants.add(user.position);
      group.total += 1;
      group.byOrg.set(user.organizationId, (group.byOrg.get(user.organizationId) ?? 0) + 1);
      groups.set(key, group);
    }

    const entries: LegacyPositionInventoryEntry[] = [...groups.entries()]
      .map(([normalizedValue, group]) => {
        const resolution = mappingIndex.get(normalizedValue);
        const mapping: LegacyPositionInventoryEntry['mapping'] = !resolution
          ? 'unresolved'
          : resolution.type === 'ambiguous'
            ? 'ambiguous'
            : resolution.type === 'skip'
              ? 'skip'
              : 'mapped';
        return {
          normalizedValue,
          rawVariants: [...group.rawVariants].sort(),
          totalUsers: group.total,
          organizationCounts: Object.fromEntries(group.byOrg),
          mapping,
        };
      })
      .sort((a, b) => b.totalUsers - a.totalUsers);

    return { distinctValues: entries.length, totalNonEmptyUsers: users.length, entries };
  }

  /**
   * Dry-run by default (writes nothing). With `dryRun: false`, sets `positionId` on each
   * mapped user's current primary DepartmentMembership -- never creates a Position (every
   * `positionCode` must already exist, created ahead of time via the Position admin UI/API
   * from PR 275) and never creates a membership for a user without a current primary one.
   * Idempotent: re-running leaves an already-correct membership untouched and never
   * overwrites a membership that already carries a *different* Position.
   */
  async run(
    mapping: readonly LegacyPositionMappingEntry[],
    options: { dryRun?: boolean; organizationId?: string } = {},
  ): Promise<LegacyPositionMigrationReport> {
    const dryRun = options.dryRun ?? true;
    const users = await this.loadUsersWithLegacyPosition(options.organizationId);
    const mappingIndex = buildMappingIndex(mapping);

    const outcomes: LegacyPositionOutcome[] = [];
    for (const user of users) {
      outcomes.push(await this.resolveUser(user, mappingIndex, dryRun));
    }

    return {
      dryRun,
      totalConsidered: outcomes.length,
      mapped: outcomes.filter((outcome) => outcome.status === 'mapped').length,
      unresolved: outcomes.filter((outcome) => outcome.status === 'unresolved').length,
      ambiguous: outcomes.filter((outcome) => outcome.status === 'ambiguous').length,
      skipped: outcomes.filter((outcome) => outcome.status === 'skipped').length,
      outcomes,
    };
  }

  private async resolveUser(
    user: UserWithLegacyPosition,
    mappingIndex: Map<string, ResolvedMappingEntry>,
    dryRun: boolean,
  ): Promise<LegacyPositionOutcome> {
    const base = { userId: user.id, organizationId: user.organizationId, legacyValue: user.position };
    const resolution = mappingIndex.get(normalizeLegacyPositionValue(user.position));

    if (!resolution) return { ...base, status: 'unresolved', reason: 'no_mapping_entry' };
    if (resolution.type === 'ambiguous') return { ...base, status: 'ambiguous', reason: 'conflicting_mapping_entries' };
    if (resolution.type === 'skip') return { ...base, status: 'skipped', reason: resolution.reason };

    const positionCode = resolution.positionCode;
    const position = await this.prisma.position.findFirst({
      where: { organizationId: user.organizationId, code: positionCode },
      select: { id: true, status: true },
    });
    if (!position) return { ...base, status: 'unresolved', reason: 'position_code_not_found_in_organization', positionCode };
    if (position.status !== 'active') return { ...base, status: 'unresolved', reason: 'position_archived', positionCode };

    const membership = await this.prisma.departmentMembership.findFirst({
      where: { organizationId: user.organizationId, userId: user.id, isPrimary: true, effectiveTo: null },
      select: { id: true, positionId: true },
    });
    if (!membership) return { ...base, status: 'unresolved', reason: 'no_current_primary_membership', positionCode };
    if (membership.positionId === position.id) return { ...base, status: 'mapped', positionCode, alreadyApplied: true };
    if (membership.positionId !== null) {
      return { ...base, status: 'skipped', reason: 'membership_already_has_a_different_position', positionCode };
    }

    if (!dryRun) {
      await this.prisma.$transaction(async (tx) => {
        await tx.departmentMembership.update({ where: { id: membership.id }, data: { positionId: position.id } });
        await recordOrgStructureEvent(tx, {
          organizationId: user.organizationId,
          actorId: null,
          entityType: 'department_membership',
          entityId: membership.id,
          eventType: 'department_membership.legacy_position_migrated',
          operationId: newOperationId(),
          metadata: { userId: user.id, legacyValue: user.position, positionCode },
        });
      });
    }
    return { ...base, status: 'mapped', positionCode, alreadyApplied: false };
  }
}

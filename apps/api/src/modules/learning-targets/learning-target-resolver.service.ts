import { Injectable } from '@nestjs/common';

import { orgLearningTargetResolutionDuration } from '../../common/observability/metrics.js';
import { observeOrgDuration } from '../../common/observability/org-observability.js';
import { PrismaService } from '../../database/prisma.service.js';
import { isSelfOrDescendant } from '../departments/public.js';
import { buildResolution, type LearningTargetResolution, type LearningTargetSource } from './learning-target-resolver.types.js';

const MS_PER_DAY = 86_400_000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Dedupe by (type, id) -- the same underlying record must never count as two sources. */
function dedupe(sources: LearningTargetSource[]): LearningTargetSource[] {
  const seen = new Map<string, LearningTargetSource>();
  for (const source of sources) seen.set(`${source.type}:${source.id}`, source);
  return [...seen.values()];
}

/**
 * Single source of truth for "is this user entitled to learn this course, and why" (PR 277).
 * Every source is resolved fresh on every call -- there is no cache and no stored
 * "entitlement" row, so removing one source (e.g. closing a group membership) while another
 * still grants access (e.g. a Department assignment) never revokes access, and the reverse is
 * also automatically true. Consumers that only need a yes/no gate should check `isEntitled`.
 */
@Injectable()
export class LearningTargetResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(
    organizationId: string,
    userId: string,
    courseId: string,
    options: { course?: { selfEnrollmentEnabled: boolean } } = {},
  ): Promise<LearningTargetResolution> {
    return observeOrgDuration(orgLearningTargetResolutionDuration, {}, async () => {
      const [course, currentPrimaryMembership] = await Promise.all([
      options.course ?? this.prisma.course.findFirst({ where: { id: courseId, organizationId }, select: { selfEnrollmentEnabled: true } }),
      this.prisma.departmentMembership.findFirst({
        where: { organizationId, userId, isPrimary: true, effectiveTo: null },
        select: { departmentId: true, positionId: true, effectiveFrom: true },
      }),
    ]);

      const sources: LearningTargetSource[] = [];

      sources.push(...(await this.resolveDirectAssignments(organizationId, userId, courseId)));
      sources.push(...(await this.resolveGroupAssignments(organizationId, userId, courseId)));
      if (currentPrimaryMembership) {
        sources.push(...(await this.resolveDepartmentAssignments(organizationId, courseId, currentPrimaryMembership.departmentId)));
        sources.push(...(await this.resolvePositionCourse(organizationId, courseId, currentPrimaryMembership)));
      }
      if (course?.selfEnrollmentEnabled) {
        sources.push({ type: 'SELF_ENROLLMENT', id: courseId, requirement: 'OPTIONAL', dueAt: null });
      }

      return buildResolution(dedupe(sources));
    });
  }

  private async resolveDirectAssignments(organizationId: string, userId: string, courseId: string): Promise<LearningTargetSource[]> {
    const rows = await this.prisma.assignment.findMany({
      where: { organizationId, courseId, userId, deletedAt: null, status: { not: 'cancelled' } },
      select: { id: true, dueAt: true },
    });
    return rows.map((row) => ({ type: 'DIRECT_ASSIGNMENT', id: row.id, requirement: 'REQUIRED', dueAt: row.dueAt }));
  }

  private async resolveGroupAssignments(organizationId: string, userId: string, courseId: string): Promise<LearningTargetSource[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        organizationId,
        courseId,
        deletedAt: null,
        status: { not: 'cancelled' },
        group: { members: { some: { userId, organizationId, deletedAt: null } } },
      },
      select: { id: true, dueAt: true },
    });
    return rows.map((row) => ({ type: 'GROUP', id: row.id, requirement: 'REQUIRED', dueAt: row.dueAt }));
  }

  private async resolveDepartmentAssignments(
    organizationId: string,
    courseId: string,
    userDepartmentId: string,
  ): Promise<LearningTargetSource[]> {
    const candidates = await this.prisma.assignment.findMany({
      where: { organizationId, courseId, departmentId: { not: null }, deletedAt: null, status: { not: 'cancelled' } },
      select: { id: true, departmentId: true, includeDescendants: true, dueAt: true },
    });

    const matches: LearningTargetSource[] = [];
    for (const candidate of candidates) {
      const targetDepartmentId = candidate.departmentId;
      if (!targetDepartmentId) continue;

      const isMatch = candidate.includeDescendants
        ? await isSelfOrDescendant(this.prisma, targetDepartmentId, userDepartmentId, organizationId)
        : targetDepartmentId === userDepartmentId;

      if (isMatch) matches.push({ type: 'DEPARTMENT', id: candidate.id, requirement: 'REQUIRED', dueAt: candidate.dueAt });
    }
    return matches;
  }

  private async resolvePositionCourse(
    organizationId: string,
    courseId: string,
    membership: { positionId: string | null; effectiveFrom: Date },
  ): Promise<LearningTargetSource[]> {
    if (!membership.positionId) return [];

    const positionCourse = await this.prisma.positionCourse.findFirst({
      where: { organizationId, courseId, positionId: membership.positionId, status: 'active' },
      select: { id: true, requirement: true, dueDays: true },
    });
    if (!positionCourse) return [];

    const dueAt = positionCourse.dueDays === null ? null : addDays(membership.effectiveFrom, positionCourse.dueDays);
    return [{ type: 'POSITION', id: positionCourse.id, requirement: positionCourse.requirement, dueAt }];
  }
}

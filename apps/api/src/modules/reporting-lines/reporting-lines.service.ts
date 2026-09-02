import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { computeEffectiveDepartmentManagers } from '../department-managers/public.js';
import { newOperationId, recordOrgStructureEvent, runSerializableWithRetry } from '../departments/public.js';
import { wouldCreateDirectReportingCycle } from './reporting-line-queries.js';
import { CreateReportingLineInput, UpdateReportingLineInput } from './reporting-lines.schemas.js';

type TransactionClient = Prisma.TransactionClient;

const reportingLineSelect = {
  id: true,
  organizationId: true,
  employeeId: true,
  managerId: true,
  type: true,
  isPrimary: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type EffectiveManagerResult = {
  managerId: string;
  source: 'REPORTING_LINE' | 'DEPARTMENT_MANAGER';
} | { managerId: null; source: null };

/** Distinguishes which partial unique index a P2002 hit, per the plan's two invariants. */
function rethrowReportingLineConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
    if (target.includes('current_primary')) {
      throw new ConflictException('This employee already has a current primary manager of this type');
    }
    throw new ConflictException('This employee already reports to this manager with this type');
  }
  throw error;
}

async function ensureAssignable(client: TransactionClient, organizationId: string, employeeId: string, managerId: string) {
  const [employee, manager] = await Promise.all([
    client.user.findFirst({ where: { id: employeeId, organizationId }, select: { id: true, status: true } }),
    client.user.findFirst({ where: { id: managerId, organizationId }, select: { id: true, status: true } }),
  ]);
  if (!employee) throw new NotFoundException('Employee not found');
  if (employee.status !== 'active') throw new ConflictException('Cannot set a reporting line for an inactive employee');
  if (!manager) throw new NotFoundException('Manager not found');
  if (manager.status !== 'active') throw new ConflictException('Cannot assign an inactive user as a manager');
}

@Injectable()
export class ReportingLinesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.reportingLine.findMany({
      where: { organizationId, employeeId: userId },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      select: reportingLineSelect,
    });
  }

  /**
   * Plan fallback chain: a current primary DIRECT ReportingLine wins; otherwise fall back to
   * the current primary effective DIRECT manager of the employee's current primary Department
   * (computed the same way `department-managers` computes it, including LOCAL/INHERIT/MERGE);
   * otherwise there is no effective manager.
   */
  async getEffectiveManager(userId: string, organizationId: string): Promise<EffectiveManagerResult> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const personal = await this.prisma.reportingLine.findFirst({
      where: { organizationId, employeeId: userId, type: 'DIRECT', isPrimary: true, effectiveTo: null },
      select: { managerId: true },
    });
    if (personal) return { managerId: personal.managerId, source: 'REPORTING_LINE' };

    const membership = await this.prisma.departmentMembership.findFirst({
      where: { organizationId, userId, isPrimary: true, effectiveTo: null },
      select: { departmentId: true },
    });
    if (!membership) return { managerId: null, source: null };

    const effectiveManagers = await computeEffectiveDepartmentManagers(this.prisma, membership.departmentId, organizationId);
    const primaryDirect = effectiveManagers.find((manager) => manager.type === 'DIRECT' && manager.isPrimary);
    if (!primaryDirect) return { managerId: null, source: null };

    return { managerId: primaryDirect.userId, source: 'DEPARTMENT_MANAGER' };
  }

  async createReportingLine(input: CreateReportingLineInput, actorId: string | null) {
    if (input.type !== 'DIRECT') {
      return this.prisma.$transaction(async (tx) => {
        await ensureAssignable(tx, input.organizationId, input.employeeId, input.managerId);
        return this.insertReportingLine(tx, input, actorId);
      });
    }

    // Only DIRECT edges form the manager hierarchy graph that OrganizationAccessScopeService
    // and getEffectiveManager traverse, so only DIRECT needs the Serializable cycle guard --
    // FUNCTIONAL/PROJECT relations never chain into that graph.
    return runSerializableWithRetry(this.prisma, async (tx) => {
      await ensureAssignable(tx, input.organizationId, input.employeeId, input.managerId);

      const wouldCycle = await wouldCreateDirectReportingCycle(tx, input.employeeId, input.managerId, input.organizationId);
      if (wouldCycle) {
        throw new ConflictException('This reporting line would create a cycle in the manager hierarchy');
      }

      return this.insertReportingLine(tx, input, actorId);
    });
  }

  private async insertReportingLine(tx: TransactionClient, input: CreateReportingLineInput, actorId: string | null) {
    const created = await tx.reportingLine
      .create({
        data: {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          managerId: input.managerId,
          type: input.type,
          isPrimary: input.isPrimary,
        },
        select: reportingLineSelect,
      })
      .catch(rethrowReportingLineConflict);

    await recordOrgStructureEvent(tx, {
      organizationId: input.organizationId,
      actorId,
      entityType: 'reporting_line',
      entityId: created.id,
      eventType: 'reporting_line.created',
      operationId: newOperationId(),
      metadata: { employeeId: input.employeeId, managerId: input.managerId, type: input.type, isPrimary: input.isPrimary },
    });

    return created;
  }

  async updateReportingLine(id: string, organizationId: string, input: UpdateReportingLineInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reportingLine.findFirst({
        where: { id, organizationId },
        select: { id: true, effectiveTo: true },
      });
      if (!existing) throw new NotFoundException('Reporting line not found');
      if (existing.effectiveTo !== null) throw new ConflictException('Reporting line is already closed');

      const updated = await tx.reportingLine
        .update({ where: { id }, data: { isPrimary: input.isPrimary }, select: reportingLineSelect })
        .catch(rethrowReportingLineConflict);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'reporting_line',
        entityId: id,
        eventType: 'reporting_line.updated',
        operationId: newOperationId(),
        metadata: { isPrimary: input.isPrimary },
      });

      return updated;
    });
  }

  async closeReportingLine(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reportingLine.findFirst({
        where: { id, organizationId },
        select: { id: true, effectiveTo: true, employeeId: true, managerId: true, type: true },
      });
      if (!existing) throw new NotFoundException('Reporting line not found');
      if (existing.effectiveTo !== null) throw new ConflictException('Reporting line is already closed');

      const updated = await tx.reportingLine.update({
        where: { id },
        data: { effectiveTo: new Date() },
        select: reportingLineSelect,
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'reporting_line',
        entityId: id,
        eventType: 'reporting_line.closed',
        operationId: newOperationId(),
        metadata: { employeeId: existing.employeeId, managerId: existing.managerId, type: existing.type },
      });

      return updated;
    });
  }
}

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ReportingLinesService } from './reporting-lines.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const employeeId = '22222222-2222-2222-2222-222222222222';
const managerId = '33333333-3333-3333-3333-333333333333';
const actorId = '44444444-4444-4444-4444-444444444444';
const lineId = '55555555-5555-5555-5555-555555555555';

function duplicateLineError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['reporting_lines_current_employee_manager_type_key'] },
  });
}

function primaryConflictError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['reporting_lines_current_primary_type_key'] },
  });
}

/** A single object plays both the top-level PrismaService and the transaction client. */
function createPrisma(overrides: {
  user?: Partial<Record<'findFirst', jest.Mock>>;
  reportingLine?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update', jest.Mock>>;
  departmentMembership?: Partial<Record<'findFirst', jest.Mock>>;
  queryRaw?: jest.Mock;
} = {}) {
  const base: Record<string, unknown> = {
    user: {
      findFirst: jest.fn(async () => ({ id: employeeId, status: 'active' })),
      ...overrides.user,
    },
    reportingLine: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: lineId })),
      update: jest.fn(async () => ({ id: lineId })),
      ...overrides.reportingLine,
    },
    departmentMembership: {
      findFirst: jest.fn(async () => null),
      ...overrides.departmentMembership,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
    $queryRaw: overrides.queryRaw ?? jest.fn(async () => []),
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

const directInput = { organizationId, employeeId, managerId, type: 'DIRECT' as const, isPrimary: true };
const functionalInput = { organizationId, employeeId, managerId, type: 'FUNCTIONAL' as const, isPrimary: false };

describe('ReportingLinesService createReportingLine', () => {
  it('throws NotFoundException for a cross-tenant or missing employee', async () => {
    const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an inactive manager', async () => {
    const findFirst = jest.fn(async (args: { where: { id: string } }) =>
      args.where.id === employeeId ? { id: employeeId, status: 'active' } : { id: managerId, status: 'invited' },
    );
    const prisma = createPrisma({ user: { findFirst } });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a DIRECT edge that would create a cycle', async () => {
    // employeeId already (transitively) reports to no one, but managerId is already a report
    // of employeeId -- adding employeeId -> managerId would close the loop.
    const queryRaw = jest.fn(async () => [{ id: managerId }]);
    const prisma = createPrisma({ queryRaw });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a DIRECT reporting line and records an OrgStructureEvent when no cycle exists', async () => {
    const prisma = createPrisma();
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).resolves.toEqual({ id: lineId });
    expect((prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'reporting_line.created' }) }),
    );
  });

  it('creates a FUNCTIONAL reporting line without running the cycle check', async () => {
    const queryRaw = jest.fn(async () => []);
    const prisma = createPrisma({ queryRaw });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(functionalInput, actorId)).resolves.toEqual({ id: lineId });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('maps a duplicate current (employee, manager, type) row to a 409', async () => {
    const prisma = createPrisma({ reportingLine: { create: jest.fn(async () => { throw duplicateLineError(); }) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a duplicate current primary (employee, type) row to a 409', async () => {
    const prisma = createPrisma({ reportingLine: { create: jest.fn(async () => { throw primaryConflictError(); }) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.createReportingLine(directInput, actorId)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReportingLinesService updateReportingLine', () => {
  it('throws NotFoundException for a missing or cross-tenant line', async () => {
    const prisma = createPrisma({ reportingLine: { findFirst: jest.fn(async () => null) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.updateReportingLine(lineId, organizationId, { isPrimary: true }, actorId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects updating an already-closed line', async () => {
    const prisma = createPrisma({ reportingLine: { findFirst: jest.fn(async () => ({ id: lineId, effectiveTo: new Date() })) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.updateReportingLine(lineId, organizationId, { isPrimary: true }, actorId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates isPrimary and records an OrgStructureEvent', async () => {
    const prisma = createPrisma({ reportingLine: { findFirst: jest.fn(async () => ({ id: lineId, effectiveTo: null })) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.updateReportingLine(lineId, organizationId, { isPrimary: true }, actorId)).resolves.toEqual({ id: lineId });
  });

  it('maps a duplicate-primary conflict on update to a 409', async () => {
    const prisma = createPrisma({
      reportingLine: {
        findFirst: jest.fn(async () => ({ id: lineId, effectiveTo: null })),
        update: jest.fn(async () => { throw primaryConflictError(); }),
      },
    });
    const service = new ReportingLinesService(prisma);

    await expect(service.updateReportingLine(lineId, organizationId, { isPrimary: true }, actorId)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReportingLinesService closeReportingLine', () => {
  it('throws NotFoundException for a missing or cross-tenant line', async () => {
    const prisma = createPrisma({ reportingLine: { findFirst: jest.fn(async () => null) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.closeReportingLine(lineId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects closing an already-closed line', async () => {
    const prisma = createPrisma({
      reportingLine: { findFirst: jest.fn(async () => ({ id: lineId, effectiveTo: new Date(), employeeId, managerId, type: 'DIRECT' })) },
    });
    const service = new ReportingLinesService(prisma);

    await expect(service.closeReportingLine(lineId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('closes a line and records an OrgStructureEvent', async () => {
    const prisma = createPrisma({
      reportingLine: { findFirst: jest.fn(async () => ({ id: lineId, effectiveTo: null, employeeId, managerId, type: 'DIRECT' })) },
    });
    const service = new ReportingLinesService(prisma);

    await expect(service.closeReportingLine(lineId, organizationId, actorId)).resolves.toEqual({ id: lineId });
  });
});

describe('ReportingLinesService listForUser', () => {
  it('throws NotFoundException for a missing or cross-tenant user', async () => {
    const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.listForUser(employeeId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the full history for the user as employee', async () => {
    const rows = [{ id: lineId }];
    const prisma = createPrisma({ reportingLine: { findMany: jest.fn(async () => rows) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.listForUser(employeeId, organizationId)).resolves.toEqual(rows);
  });
});

describe('ReportingLinesService getEffectiveManager', () => {
  it('throws NotFoundException for a missing or cross-tenant user', async () => {
    const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.getEffectiveManager(employeeId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prefers the current primary DIRECT ReportingLine over any Department fallback', async () => {
    const prisma = createPrisma({ reportingLine: { findFirst: jest.fn(async () => ({ managerId })) } });
    const service = new ReportingLinesService(prisma);

    await expect(service.getEffectiveManager(employeeId, organizationId)).resolves.toEqual({
      managerId,
      source: 'REPORTING_LINE',
    });
  });

  it('returns null when there is no personal ReportingLine and no current primary Department membership', async () => {
    const prisma = createPrisma();
    const service = new ReportingLinesService(prisma);

    await expect(service.getEffectiveManager(employeeId, organizationId)).resolves.toEqual({ managerId: null, source: null });
  });
});

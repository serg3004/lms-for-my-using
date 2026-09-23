import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { ChecklistScaleService } from './checklist-scale.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const scaleId = '22222222-2222-2222-2222-222222222222';
const actorId = '33333333-3333-3333-3333-333333333333';

function fakeAuditLog() {
  return { record: jest.fn(async () => undefined) } as unknown as AuditLogService;
}

function baseScale(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: scaleId,
    organizationId,
    name: 'Service quality',
    status: 'active',
    createdBy: actorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    levels: [
      { id: 'level-1', value: 1, label: 'Poor', score: 0 },
      { id: 'level-2', value: 2, label: 'Good', score: 10 },
    ],
    ...overrides,
  };
}

function createPrisma(overrides: {
  checklistScale?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update', jest.Mock>>;
  checklistScaleLevel?: Partial<Record<'createMany' | 'deleteMany', jest.Mock>>;
  checklistInstance?: Partial<Record<'findFirst', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    checklistScale: {
      findFirst: jest.fn(async () => baseScale()),
      findMany: jest.fn(async () => [baseScale()]),
      create: jest.fn(async () => baseScale()),
      update: jest.fn(async () => baseScale()),
      ...overrides.checklistScale,
    },
    checklistScaleLevel: {
      createMany: jest.fn(async () => ({ count: 2 })),
      deleteMany: jest.fn(async () => ({ count: 2 })),
      ...overrides.checklistScaleLevel,
    },
    checklistInstance: {
      findFirst: jest.fn(async () => null),
      ...overrides.checklistInstance,
    },
  };
  base['$transaction'] = jest.fn(async (arg: unknown) => (arg as (tx: unknown) => unknown)(base));
  return base as unknown as PrismaService;
}

describe('ChecklistScaleService', () => {
  describe('list/get', () => {
    it('lists scales ordered active-first', async () => {
      const prisma = createPrisma();
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await service.list(organizationId);

      expect(prisma.checklistScale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId }, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
      );
    });

    it('throws 404 for a scale outside the caller organization', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.get(scaleId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates the scale and its levels in one transaction, then audits it', async () => {
      const prisma = createPrisma();
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      const result = await service.create(
        organizationId,
        { name: 'Service quality', levels: [{ value: 1, label: 'Poor', score: 0 }, { value: 2, label: 'Good', score: 10 }] },
        actorId,
      );

      expect(prisma.checklistScale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, name: 'Service quality', createdBy: actorId } }),
      );
      expect(prisma.checklistScaleLevel.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { organizationId, scaleId, value: 1, label: 'Poor', score: 0 },
            { organizationId, scaleId, value: 2, label: 'Good', score: 10 },
          ],
        }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.created' }));
      expect(result.levels).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('replaces name and the full level set when the scale is not yet used', async () => {
      const prisma = createPrisma();
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await service.update(scaleId, organizationId, { name: 'Renamed', levels: [{ value: 1, label: 'Low', score: 0 }, { value: 2, label: 'High', score: 5 }] }, actorId);

      expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, checklist: { items: { some: { scaleId } } } } }),
      );
      expect(prisma.checklistScaleLevel.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: { scaleId, organizationId } }));
      expect(prisma.checklistScaleLevel.createMany).toHaveBeenCalled();
      expect(prisma.checklistScale.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: scaleId, organizationId }, data: { name: 'Renamed' } }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.updated' }));
    });

    it('rejects modifying a scale already used by an assigned checklist', async () => {
      const prisma = createPrisma({ checklistInstance: { findFirst: jest.fn(async () => ({ id: 'instance-1' })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.update(scaleId, organizationId, { name: 'Renamed' }, actorId)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checklistScale.update).not.toHaveBeenCalled();
    });

    it('rejects modifying an already-archived scale even if unused', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => baseScale({ status: 'archived' })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.update(scaleId, organizationId, { name: 'Renamed' }, actorId)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checklistInstance.findFirst).not.toHaveBeenCalled();
    });

    it('throws 404 for a scale outside the caller organization', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.update(scaleId, organizationId, { name: 'Renamed' }, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archive', () => {
    it('archives an active scale and audits it -- the one lifecycle transition allowed regardless of usage', async () => {
      const prisma = createPrisma({ checklistInstance: { findFirst: jest.fn(async () => ({ id: 'instance-1' })) } });
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await service.archive(scaleId, organizationId, actorId);

      expect(prisma.checklistScale.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: scaleId, organizationId }, data: { status: 'archived' } }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.archived' }));
    });

    it('is idempotent for an already-archived scale (no-op, no duplicate audit entry)', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => baseScale({ status: 'archived' })) } });
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await service.archive(scaleId, organizationId, actorId);

      expect(prisma.checklistScale.update).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('throws 404 for a scale outside the caller organization', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.archive(scaleId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

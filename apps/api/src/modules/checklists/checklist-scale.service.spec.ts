import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    isDefault: false,
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
  checklistScale?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update' | 'delete', jest.Mock>>;
  checklistScaleLevel?: Partial<Record<'createMany' | 'deleteMany', jest.Mock>>;
  checklistInstance?: Partial<Record<'findFirst', jest.Mock>>;
  checklistItem?: Partial<Record<'findFirst' | 'findMany', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    checklistScale: {
      findFirst: jest.fn(async () => baseScale()),
      findMany: jest.fn(async () => [baseScale()]),
      create: jest.fn(async () => baseScale()),
      update: jest.fn(async () => baseScale()),
      delete: jest.fn(async () => baseScale()),
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
    checklistItem: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      ...overrides.checklistItem,
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
        expect.objectContaining({ where: { organizationId }, orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { name: 'asc' }] }),
      );
    });

    it('flags a scale used by an assigned checklist as inUse, in one query for the whole list', async () => {
      const prisma = createPrisma({
        checklistScale: { findMany: jest.fn(async () => [baseScale(), baseScale({ id: 'scale-2', name: 'Other' })]) },
        checklistItem: { findMany: jest.fn(async () => [{ scaleId: scaleId }]) },
      });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      const result = await service.list(organizationId);

      expect(result.map((scale) => scale.inUse)).toEqual([true, false]);
      expect(prisma.checklistItem.findMany).toHaveBeenCalledTimes(1);
    });

    it('reports inUse=false for an unused scale on get', async () => {
      const service = new ChecklistScaleService(createPrisma(), fakeAuditLog());

      await expect(service.get(scaleId, organizationId)).resolves.toMatchObject({ id: scaleId, inUse: false });
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

  describe('copy', () => {
    it('copies name and levels into a new scale and audits it', async () => {
      const prisma = createPrisma({
        checklistScale: {
          create: jest.fn(async () => baseScale({ id: 'copy-id', name: 'Service quality (copy)' })),
        },
      });
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await service.copy(scaleId, organizationId, undefined, actorId);

      expect(prisma.checklistScale.create).toHaveBeenCalledWith({
        data: { organizationId, name: 'Service quality (copy)', createdBy: actorId },
      });
      expect(prisma.checklistScaleLevel.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId, scaleId: 'copy-id', value: 1, label: 'Poor', score: 0 },
          { organizationId, scaleId: 'copy-id', value: 2, label: 'Good', score: 10 },
        ],
      });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.copied', targetId: 'copy-id' }));
    });

    it('uses the supplied (localized) name, capped at 120 characters', async () => {
      const prisma = createPrisma();
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await service.copy(scaleId, organizationId, 'x'.repeat(130), actorId);

      expect(prisma.checklistScale.create).toHaveBeenCalledWith({
        data: { organizationId, name: 'x'.repeat(120), createdBy: actorId },
      });
    });

    it('throws 404 for a scale outside the caller organization', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.copy(scaleId, organizationId, undefined, actorId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.checklistScale.create).not.toHaveBeenCalled();
    });
  });

  describe('default scale (PR 344)', () => {
    it('does not create a second default scale when one exists', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => ({ id: 'default-id' })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.ensureDefaultScale(organizationId)).resolves.toBe('default-id');
      expect(prisma.checklistScale.create).not.toHaveBeenCalled();
    });

    it('creates the Yes/No default scale in the caller language on first use and audits it', async () => {
      const prisma = createPrisma({
        checklistScale: {
          findFirst: jest.fn(async () => null),
          create: jest.fn(async () => baseScale({ id: 'default-id', isDefault: true })),
        },
      });
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await expect(service.ensureDefaultScale(organizationId, 'en')).resolves.toBe('default-id');

      expect(prisma.checklistScale.create).toHaveBeenCalledWith({ data: { organizationId, name: 'Yes/No', isDefault: true } });
      expect(prisma.checklistScaleLevel.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId, scaleId: 'default-id', value: 1, label: 'No', score: 0 },
          { organizationId, scaleId: 'default-id', value: 2, label: 'Yes', score: 100 },
        ],
      });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.default_created', actorId: null }));
    });

    it('falls back to Russian for an unknown or missing language', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null), create: jest.fn(async () => baseScale({ id: 'default-id' })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await service.ensureDefaultScale(organizationId, null);

      expect(prisma.checklistScale.create).toHaveBeenCalledWith({ data: { organizationId, name: 'Да/Нет', isDefault: true } });
    });

    it('returns the winner when two first calls race on the unique index', async () => {
      const findFirst = jest.fn<() => Promise<{ id: string } | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'winner-id' });
      const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
      const prisma = createPrisma({ checklistScale: { findFirst, create: jest.fn(async () => { throw conflict; }) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.ensureDefaultScale(organizationId)).resolves.toBe('winner-id');
    });

    it.each([
      ['update', (service: ChecklistScaleService) => service.update(scaleId, organizationId, { name: 'x' }, actorId)],
      ['archive', (service: ChecklistScaleService) => service.archive(scaleId, organizationId, actorId)],
      ['remove', (service: ChecklistScaleService) => service.remove(scaleId, organizationId, actorId)],
    ])('refuses to %s the default scale', async (_name, run) => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => baseScale({ isDefault: true })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(run(service)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.checklistScale.update).not.toHaveBeenCalled();
      expect(prisma.checklistScale.delete).not.toHaveBeenCalled();
    });

    it('lets the default scale be copied into an ordinary, editable scale', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => baseScale({ isDefault: true })) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await service.copy(scaleId, organizationId, undefined, actorId);

      expect(prisma.checklistScale.create).toHaveBeenCalledWith({ data: { organizationId, name: 'Service quality (copy)', createdBy: actorId } });
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

  describe('remove', () => {
    it('deletes an unreferenced scale and audits it', async () => {
      const prisma = createPrisma();
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await service.remove(scaleId, organizationId, actorId);

      expect(prisma.checklistScale.delete).toHaveBeenCalledWith({ where: { id: scaleId, organizationId } });
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'checklist_scale.deleted' }));
    });

    it('rejects deleting a scale used by checklist criteria (archive instead)', async () => {
      const prisma = createPrisma({ checklistItem: { findFirst: jest.fn(async () => ({ id: 'item-1' })) } });
      const auditLog = fakeAuditLog();
      const service = new ChecklistScaleService(prisma, auditLog);

      await expect(service.remove(scaleId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.checklistScale.delete).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('throws 404 for a scale outside the caller organization', async () => {
      const prisma = createPrisma({ checklistScale: { findFirst: jest.fn(async () => null) } });
      const service = new ChecklistScaleService(prisma, fakeAuditLog());

      await expect(service.remove(scaleId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

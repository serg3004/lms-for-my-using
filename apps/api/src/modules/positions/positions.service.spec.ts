import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { PositionsService } from './positions.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const positionId = '66666666-6666-6666-6666-666666666666';
const actorId = '44444444-4444-4444-4444-444444444444';

function createPrisma(overrides: {
  position?: Partial<Record<'findFirst' | 'findMany' | 'count' | 'create' | 'update', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    position: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides.position,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('PositionsService', () => {
  describe('listPositions', () => {
    it('paginates and applies search/status filters, tenant-scoped', async () => {
      const findMany = jest.fn(async () => []);
      const count = jest.fn(async () => 0);
      const prisma = createPrisma({ position: { findMany, count } });
      const service = new PositionsService(prisma);

      await service.listPositions(organizationId, { page: 2, pageSize: 10, search: 'eng', status: 'active' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId,
            status: 'active',
            OR: [
              { title: { contains: 'eng', mode: 'insensitive' } },
              { code: { contains: 'eng', mode: 'insensitive' } },
            ],
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getPosition', () => {
    it('throws NotFoundException for a missing or cross-tenant position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => null) } });
      const service = new PositionsService(prisma);

      await expect(service.getPosition(positionId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createPosition', () => {
    it('creates a position and records an OrgStructureEvent', async () => {
      const create = jest.fn(async () => ({ id: positionId, code: 'eng-lead', title: 'Engineering Lead' }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ position: { create } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new PositionsService(prisma);

      await service.createPosition({ organizationId, code: 'eng-lead', title: 'Engineering Lead' }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, code: 'eng-lead', title: 'Engineering Lead', description: null } }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'position.created' }) }),
      );
    });

    it('rejects a duplicate code within the same tenant', async () => {
      const create = jest.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      });
      const prisma = createPrisma({ position: { create } });
      const service = new PositionsService(prisma);

      await expect(
        service.createPosition({ organizationId, code: 'eng-lead', title: 'Engineering Lead' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updatePosition', () => {
    it('throws NotFoundException for a missing or cross-tenant position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => null) } });
      const service = new PositionsService(prisma);

      await expect(service.updatePosition(positionId, organizationId, { title: 'New' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('archivePosition', () => {
    it('rejects archiving an already-archived position', async () => {
      const findFirst = jest.fn(async () => ({ id: positionId, status: 'archived' }));
      const prisma = createPrisma({ position: { findFirst } });
      const service = new PositionsService(prisma);

      await expect(service.archivePosition(positionId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives an active position', async () => {
      const findFirst = jest.fn(async () => ({ id: positionId, status: 'active' }));
      const update = jest.fn(async () => ({ id: positionId, status: 'archived' }));
      const prisma = createPrisma({ position: { findFirst, update } });
      const service = new PositionsService(prisma);

      await service.archivePosition(positionId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'archived' }) }));
    });
  });

  describe('restorePosition', () => {
    it('rejects restoring a position that is not archived', async () => {
      const findFirst = jest.fn(async () => ({ id: positionId, status: 'active' }));
      const prisma = createPrisma({ position: { findFirst } });
      const service = new PositionsService(prisma);

      await expect(service.restorePosition(positionId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores an archived position', async () => {
      const findFirst = jest.fn(async () => ({ id: positionId, status: 'archived' }));
      const update = jest.fn(async () => ({ id: positionId, status: 'active' }));
      const prisma = createPrisma({ position: { findFirst, update } });
      const service = new PositionsService(prisma);

      await service.restorePosition(positionId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'active', archivedAt: null } }),
      );
    });
  });
});

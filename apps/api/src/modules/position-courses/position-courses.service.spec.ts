import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { PositionCoursesService } from './position-courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const positionId = '22222222-2222-2222-2222-222222222222';
const courseId = '33333333-3333-3333-3333-333333333333';
const positionCourseId = '44444444-4444-4444-4444-444444444444';
const actorId = '55555555-5555-5555-5555-555555555555';

function createPrisma(overrides: {
  positionCourse?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update', jest.Mock>>;
  position?: Partial<Record<'findFirst', jest.Mock>>;
  course?: Partial<Record<'findFirst', jest.Mock>>;
} = {}) {
  return {
    positionCourse: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides.positionCourse,
    },
    position: {
      findFirst: jest.fn(async () => ({ id: positionId })),
      ...overrides.position,
    },
    course: {
      findFirst: jest.fn(async () => ({ id: courseId })),
      ...overrides.course,
    },
  } as unknown as PrismaService;
}

function createAuditLog() {
  return { record: jest.fn(async () => {}) } as unknown as ConstructorParameters<typeof PositionCoursesService>[1];
}

describe('PositionCoursesService', () => {
  describe('createPositionCourse', () => {
    it('rejects a missing Position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => null) } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(
        service.createPositionCourse({ organizationId, positionId, courseId, requirement: 'REQUIRED' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a missing Course', async () => {
      const prisma = createPrisma({ course: { findFirst: jest.fn(async () => null) } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(
        service.createPositionCourse({ organizationId, positionId, courseId, requirement: 'REQUIRED' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a requirement and records an audit log entry', async () => {
      const create = jest.fn(async () => ({ id: positionCourseId, positionId, courseId, requirement: 'REQUIRED', dueDays: 30 }));
      const prisma = createPrisma({ positionCourse: { create } });
      const auditLog = createAuditLog();
      const service = new PositionCoursesService(prisma, auditLog);

      await service.createPositionCourse({ organizationId, positionId, courseId, requirement: 'REQUIRED', dueDays: 30 }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, positionId, courseId, requirement: 'REQUIRED', dueDays: 30 } }),
      );
      expect((auditLog as unknown as { record: jest.Mock }).record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'position_course.created' }),
      );
    });

    it('rejects a duplicate (organizationId, positionId, courseId)', async () => {
      const create = jest.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      });
      const prisma = createPrisma({ positionCourse: { create } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(
        service.createPositionCourse({ organizationId, positionId, courseId, requirement: 'REQUIRED' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updatePositionCourse', () => {
    it('throws NotFoundException for a missing or cross-tenant requirement', async () => {
      const prisma = createPrisma({ positionCourse: { findFirst: jest.fn(async () => null) } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(
        service.updatePositionCourse(positionCourseId, organizationId, { requirement: 'OPTIONAL' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the requirement and dueDays', async () => {
      const update = jest.fn(async () => ({ id: positionCourseId }));
      const prisma = createPrisma({
        positionCourse: { findFirst: jest.fn(async () => ({ id: positionCourseId })), update },
      });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await service.updatePositionCourse(positionCourseId, organizationId, { requirement: 'OPTIONAL', dueDays: 10 }, actorId);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { requirement: 'OPTIONAL', dueDays: 10 } }),
      );
    });
  });

  describe('archivePositionCourse', () => {
    it('rejects archiving an already-archived requirement', async () => {
      const prisma = createPrisma({ positionCourse: { findFirst: jest.fn(async () => ({ id: positionCourseId, status: 'archived' })) } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(service.archivePositionCourse(positionCourseId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives an active requirement', async () => {
      const update = jest.fn(async () => ({ id: positionCourseId, status: 'archived' }));
      const prisma = createPrisma({
        positionCourse: { findFirst: jest.fn(async () => ({ id: positionCourseId, status: 'active' })), update },
      });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await service.archivePositionCourse(positionCourseId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'archived' }) }));
    });
  });

  describe('restorePositionCourse', () => {
    it('rejects restoring a requirement that is not archived', async () => {
      const prisma = createPrisma({ positionCourse: { findFirst: jest.fn(async () => ({ id: positionCourseId, status: 'active' })) } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await expect(service.restorePositionCourse(positionCourseId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores an archived requirement', async () => {
      const update = jest.fn(async () => ({ id: positionCourseId, status: 'active' }));
      const prisma = createPrisma({
        positionCourse: { findFirst: jest.fn(async () => ({ id: positionCourseId, status: 'archived' })), update },
      });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await service.restorePositionCourse(positionCourseId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'active', archivedAt: null } }),
      );
    });
  });

  describe('listPositionCourses', () => {
    it('filters by positionId, courseId, and status', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ positionCourse: { findMany } });
      const service = new PositionCoursesService(prisma, createAuditLog());

      await service.listPositionCourses(organizationId, { positionId, courseId, status: 'active' });

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId, positionId, courseId, status: 'active' } }));
    });
  });
});

import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { CoursesService } from './courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const instructorId = '33333333-3333-3333-3333-333333333333';

describe('CoursesService instructors', () => {
  it('adds an instructor by upserting so re-assigning a removed instructor clears deletedAt', async () => {
    const upsert = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: async () => ({ id: instructorId }) },
      courseInstructor: { upsert, findMany },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await service.addInstructor(courseId, organizationId, { instructorId });

    expect(upsert).toHaveBeenCalledWith({
      where: { courseId_instructorId: { courseId, instructorId } },
      create: { courseId, instructorId, organizationId },
      update: { deletedAt: null },
    });
  });

  it('rejects adding an instructor who does not exist in the organization', async () => {
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(service.addInstructor(courseId, organizationId, { instructorId })).rejects.toThrow(NotFoundException);
  });

  it('removes an instructor by soft-deleting the row rather than deleting it', async () => {
    const update = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      courseInstructor: {
        findFirst: async () => ({ courseId, instructorId }),
        update,
        findMany,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await service.removeInstructor(courseId, organizationId, instructorId);

    expect(update).toHaveBeenCalledWith({
      where: { courseId_instructorId: { courseId, instructorId } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('throws when removing an instructor who is already removed or was never assigned', async () => {
    const prisma = {
      courseInstructor: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(service.removeInstructor(courseId, organizationId, instructorId)).rejects.toThrow(NotFoundException);
  });
});

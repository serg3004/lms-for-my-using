import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseAccessPolicy } from '../course-access/course-access.policy.js';
import { CoursesService } from './courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const instructorId = '33333333-3333-3333-3333-333333333333';
// Unused by the methods under test in this file (createCourse is covered separately).
const courseAccess = {} as unknown as CourseAccessPolicy;

describe('CoursesService instructors', () => {
  it('adds an instructor only when the user has an instructor membership in the organization', async () => {
    const findInstructor = jest.fn(async () => ({ id: instructorId }));
    const upsert = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: findInstructor },
      courseInstructor: { upsert, findMany },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, courseAccess);

    await service.addInstructor(courseId, organizationId, { instructorId });

    expect(findInstructor).toHaveBeenCalledWith({
      where: {
        id: instructorId,
        organizationId,
        deletedAt: null,
        memberships: {
          some: {
            organizationId,
            role: 'instructor',
          },
        },
      },
      select: { id: true },
    });
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
    const service = new CoursesService(prisma, courseAccess);

    await expect(service.addInstructor(courseId, organizationId, { instructorId })).rejects.toThrow(NotFoundException);
  });

  it('rejects adding a user without an instructor membership', async () => {
    const findInstructor = jest.fn(async () => null);
    const upsert = jest.fn(async () => ({}));
    const prisma = {
      course: { findFirst: async () => ({ id: courseId }) },
      user: { findFirst: findInstructor },
      courseInstructor: { upsert },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, courseAccess);

    await expect(service.addInstructor(courseId, organizationId, { instructorId })).rejects.toThrow(NotFoundException);
    expect(findInstructor).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberships: {
          some: {
            organizationId,
            role: 'instructor',
          },
        },
      }),
    }));
    expect(upsert).not.toHaveBeenCalled();
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
    const service = new CoursesService(prisma, courseAccess);

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
    const service = new CoursesService(prisma, courseAccess);

    await expect(service.removeInstructor(courseId, organizationId, instructorId)).rejects.toThrow(NotFoundException);
  });
});

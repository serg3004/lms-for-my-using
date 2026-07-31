import { ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { updateCourseSchema } from './courses.schemas.js';
import { CoursesService } from './courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';

describe('CoursesService CRUD updates', () => {
  it('accepts valid editable course input', () => {
    expect(
      updateCourseSchema.parse({
        title: 'Updated course',
        slug: 'updated-course',
        description: 'Updated description',
        status: 'published',
      }),
    ).toEqual({
      title: 'Updated course',
      slug: 'updated-course',
      description: 'Updated description',
      status: 'published',
    });
  });

  it('rejects invalid editable course slug', () => {
    expect(() =>
      updateCourseSchema.parse({
        title: 'Updated course',
        slug: 'Updated Course',
      }),
    ).toThrow();
  });

  it('updates a course when slug is unique in organization', async () => {
    const updatedCourse = {
      id: courseId,
      title: 'Updated course',
      slug: 'updated-course',
      _count: { lessons: 0 },
    };
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId, slug: 'old-course' }),
        findUnique: async () => null,
        update: async () => updatedCourse,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(
      service.updateCourse(courseId, organizationId, {
        title: 'Updated course',
        slug: 'updated-course',
        status: 'published',
      }),
    ).resolves.toEqual(updatedCourse);
  });

  it('throws ConflictException when updated slug already exists', async () => {
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId, slug: 'old-course' }),
        findUnique: async () => ({ id: 'existing-course' }),
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(
      service.updateCourse(courseId, organizationId, {
        title: 'Updated course',
        slug: 'existing-course',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('soft deletes a course when it exists', async () => {
    const update = jest.fn(async () => ({ id: courseId }));
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId }),
        update,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(service.deleteCourse(courseId, organizationId)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId, organizationId },
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });

  it('throws NotFoundException when deleting missing course', async () => {
    const prisma = {
      course: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma);

    await expect(service.deleteCourse(courseId, organizationId)).rejects.toThrow(NotFoundException);
  });
});

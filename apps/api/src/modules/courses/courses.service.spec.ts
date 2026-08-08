import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseAccessPolicy, CourseScopedUser } from '../course-access/course-access.policy.js';
import { createCourseSchema, updateCourseStatusSchema } from './courses.schemas.js';
import { CoursesService } from './courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
// Unused by the methods under test below createCourse (updateCourseStatus/completion).
const courseAccess = {} as unknown as CourseAccessPolicy;

describe('Courses validation', () => {
  it('accepts valid course input', () => {
    const input = createCourseSchema.parse({
      organizationId,
      title: 'Safety Basics',
      slug: 'safety-basics',
    });

    expect(input).toEqual({
      organizationId,
      title: 'Safety Basics',
      slug: 'safety-basics',
      status: 'draft',
      selfEnrollmentEnabled: false,
    });
  });

  it('rejects invalid course slug', () => {
    expect(() =>
      createCourseSchema.parse({
        organizationId,
        title: 'Safety Basics',
        slug: 'Safety Basics',
      }),
    ).toThrow();
  });

  it('accepts valid status update', () => {
    expect(updateCourseStatusSchema.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('rejects unknown status value', () => {
    expect(() => updateCourseStatusSchema.parse({ status: 'unknown' })).toThrow();
  });
});

describe('CoursesService createCourse', () => {
  const instructorUser: CourseScopedUser = { id: userId, organizationId, roles: ['instructor'] };

  it('creates the course and assigns its instructor inside a single transaction', async () => {
    const createdCourse = { id: courseId, title: 'Safety Basics', slug: 'safety-basics', _count: { lessons: 0 } };
    const txCourseCreate = jest.fn(async () => createdCourse);
    const assignInstructor = jest.fn(async () => undefined);
    const tx = { course: { create: txCourseCreate } } as unknown as PrismaService;

    const prisma = {
      organization: { findFirst: async () => ({ id: organizationId }) },
      course: { findUnique: async () => null },
      $transaction: jest.fn(async (callback: (tx: PrismaService) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;

    const policy = { assignInstructor } as unknown as CourseAccessPolicy;
    const service = new CoursesService(prisma, policy);

    const input = createCourseSchema.parse({ organizationId, title: 'Safety Basics', slug: 'safety-basics' });

    await expect(service.createCourse(input, instructorUser)).resolves.toEqual(createdCourse);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txCourseCreate).toHaveBeenCalledWith(expect.objectContaining({ data: input }));
    expect(assignInstructor).toHaveBeenCalledWith(courseId, instructorUser, tx);
  });

  it('does not create the course when the organization does not exist', async () => {
    const prisma = {
      organization: { findFirst: async () => null },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const policy = { assignInstructor: jest.fn() } as unknown as CourseAccessPolicy;
    const service = new CoursesService(prisma, policy);

    const input = createCourseSchema.parse({ organizationId, title: 'Safety Basics', slug: 'safety-basics' });

    await expect(service.createCourse(input, instructorUser)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CoursesService updateCourseStatus', () => {
  it('throws NotFoundException when course does not exist', async () => {
    const prisma = {
      course: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, courseAccess);

    await expect(service.updateCourseStatus(courseId, organizationId, 'published')).rejects.toThrow(NotFoundException);
  });

  it('updates course status when course exists', async () => {
    const updatedCourse = { id: courseId, status: 'published', _count: { lessons: 0 } };
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId }),
        update: async () => updatedCourse,
      },
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, courseAccess);

    await expect(service.updateCourseStatus(courseId, organizationId, 'published')).resolves.toEqual(updatedCourse);
  });
});

describe('CoursesService completion', () => {
  const createService = (totalLessons: number, completedLessons: number) => {
    const prisma = {
      course: {
        findFirst: async () => ({ id: courseId }),
      },
      lesson: {
        count: async () => totalLessons,
      },
      progress: {
        count: async () => completedLessons,
      },
    } as unknown as PrismaService;

    return new CoursesService(prisma, courseAccess);
  };

  it('returns completed course when all published lessons are completed', async () => {
    const service = createService(2, 2);

    await expect(service.getCourseCompletion(courseId, userId, organizationId)).resolves.toEqual({
      courseId,
      userId,
      organizationId,
      totalLessons: 2,
      completedLessons: 2,
      isCompleted: true,
      percentage: 100,
    });
  });

  it('returns incomplete course when a published lesson is not completed', async () => {
    const service = createService(2, 1);

    await expect(service.getCourseCompletion(courseId, userId, organizationId)).resolves.toEqual({
      courseId,
      userId,
      organizationId,
      totalLessons: 2,
      completedLessons: 1,
      isCompleted: false,
      percentage: 50,
    });
  });
});

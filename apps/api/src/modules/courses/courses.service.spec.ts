import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { createCourseSchema } from './courses.schemas.js';
import { CoursesService } from './courses.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';

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
});

describe('CoursesService completion', () => {
  const createService = (totalLessons: number, completedLessons: number) => {
    const prisma = {
      course: {
        findFirst: jest.fn().mockResolvedValue({ id: courseId }),
      },
      lesson: {
        count: jest.fn().mockResolvedValue(totalLessons),
      },
      progress: {
        count: jest.fn().mockResolvedValue(completedLessons),
      },
    } as unknown as PrismaService;

    return new CoursesService(prisma);
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

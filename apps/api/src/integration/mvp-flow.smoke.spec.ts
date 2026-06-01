import { PrismaService } from '../database/prisma.service';
import { CoursesService } from '../modules/courses/courses.service';
import { ProgressService } from '../modules/progress/progress.service';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const lessonId = '44444444-4444-4444-4444-444444444444';

type AsyncMock<T> = (() => Promise<T>) & {
  setResolvedValue: (value: T) => void;
};

function createAsyncMock<T>(): AsyncMock<T> {
  let resolvedValue: T;

  const mock = async () => resolvedValue;
  mock.setResolvedValue = (value: T) => {
    resolvedValue = value;
  };

  return mock;
}

function createPrismaMock() {
  return {
    course: {
      findMany: createAsyncMock<unknown[]>(),
      findFirst: createAsyncMock<unknown>(),
    },
    lesson: {
      count: createAsyncMock<number>(),
      findFirst: createAsyncMock<unknown>(),
    },
    progress: {
      count: createAsyncMock<number>(),
      create: createAsyncMock<unknown>(),
    },
    user: {
      findFirst: createAsyncMock<unknown>(),
    },
  };
}

describe('backend MVP smoke flow', () => {
  it('covers course discovery, lesson progress, and course completion', async () => {
    const prisma = createPrismaMock();
    const coursesService = new CoursesService(prisma as unknown as PrismaService);
    const progressService = new ProgressService(prisma as unknown as PrismaService);
    const timestamp = new Date('2026-06-01T09:00:00.000Z');
    const course = {
      id: courseId,
      organizationId,
      title: 'Onboarding',
      slug: 'onboarding',
      description: null,
      status: 'published',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    prisma.course.findMany.setResolvedValue([course]);
    prisma.course.findFirst.setResolvedValue({ id: courseId });
    prisma.user.findFirst.setResolvedValue({ id: userId });
    prisma.lesson.findFirst.setResolvedValue({ id: lessonId });
    prisma.progress.create.setResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      organizationId,
      courseId,
      lessonId,
      userId,
      status: 'completed',
      score: null,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    prisma.lesson.count.setResolvedValue(1);
    prisma.progress.count.setResolvedValue(1);

    await expect(coursesService.listCourses(organizationId)).resolves.toEqual([course]);

    await expect(
      progressService.createProgress({
        organizationId,
        courseId,
        lessonId,
        userId,
        status: 'completed',
        completedAt: timestamp,
      }),
    ).resolves.toMatchObject({
      courseId,
      lessonId,
      userId,
      status: 'completed',
    });

    await expect(coursesService.getCourseCompletion(courseId, userId, organizationId)).resolves.toMatchObject({
      courseId,
      userId,
      totalLessons: 1,
      completedLessons: 1,
      isCompleted: true,
      percentage: 100,
    });
  });

  it('rejects progress when the user is missing', async () => {
    const prisma = createPrismaMock();
    const progressService = new ProgressService(prisma as unknown as PrismaService);

    prisma.course.findFirst.setResolvedValue({ id: courseId });
    prisma.user.findFirst.setResolvedValue(null);

    await expect(
      progressService.createProgress({
        organizationId,
        courseId,
        userId,
        status: 'in_progress',
      }),
    ).rejects.toThrow('User not found');
  });
});

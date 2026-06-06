import { PrismaService } from '../database/prisma.service';
import { AssignmentsService } from '../modules/assignments/assignments.service';
import { AuthService } from '../modules/auth/auth.service';
import { hashPassword } from '../modules/auth/passwords';
import { CertificatesService } from '../modules/certificates/certificates.service';
import { CoursesService } from '../modules/courses/courses.service';
import { LessonsService } from '../modules/lessons/lessons.service';
import { ProgressService } from '../modules/progress/progress.service';

const organizationId = '11111111-1111-1111-1111-111111111111';
const courseId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const lessonId = '44444444-4444-4444-4444-444444444444';
const assignmentId = '55555555-5555-5555-5555-555555555555';
const progressId = '66666666-6666-6666-6666-666666666666';
const certificateId = '77777777-7777-7777-7777-777777777777';

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
    assessmentAttempt: {
      findFirst: createAsyncMock<unknown>(),
    },
    assignment: {
      create: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
    },
    certificate: {
      create: createAsyncMock<unknown>(),
      findFirst: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
    },
    course: {
      create: createAsyncMock<unknown>(),
      findFirst: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
      findUnique: createAsyncMock<unknown>(),
    },
    group: {
      findFirst: createAsyncMock<unknown>(),
    },
    lesson: {
      count: createAsyncMock<number>(),
      create: createAsyncMock<unknown>(),
      findFirst: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
      findUnique: createAsyncMock<unknown>(),
    },
    membership: {
      findFirst: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
    },
    organization: {
      findFirst: createAsyncMock<unknown>(),
    },
    progress: {
      count: createAsyncMock<number>(),
      create: createAsyncMock<unknown>(),
      findFirst: createAsyncMock<unknown>(),
      findMany: createAsyncMock<unknown[]>(),
    },
    session: {
      create: createAsyncMock<unknown>(),
      findFirst: createAsyncMock<unknown>(),
    },
    user: {
      findFirst: createAsyncMock<unknown>(),
    },
  };
}

describe('backend MVP smoke flow', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-backend-mvp-flow';
  });

  it('covers login, course setup, assignment, progress, and certificate issuing', async () => {
    const prisma = createPrismaMock();
    const authService = new AuthService(prisma as unknown as PrismaService);
    const coursesService = new CoursesService(prisma as unknown as PrismaService);
    const lessonsService = new LessonsService(prisma as unknown as PrismaService);
    const assignmentsService = new AssignmentsService(prisma as unknown as PrismaService);
    const progressService = new ProgressService(prisma as unknown as PrismaService);
    const certificatesService = new CertificatesService(prisma as unknown as PrismaService);
    const timestamp = new Date('2026-06-01T09:00:00.000Z');
    const email = 'learner@example.com';
    const password = 'password123';
    const passwordHash = await hashPassword(password);
    const course = {
      id: courseId,
      organizationId,
      title: 'Onboarding',
      slug: 'onboarding',
      description: null,
      status: 'published' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const lesson = {
      id: lessonId,
      organizationId,
      courseId,
      title: 'Welcome',
      slug: 'welcome',
      description: null,
      order: 1,
      status: 'published' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const assignment = {
      id: assignmentId,
      organizationId,
      courseId,
      userId,
      groupId: null,
      status: 'assigned' as const,
      dueAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const progress = {
      id: progressId,
      organizationId,
      courseId,
      lessonId,
      userId,
      status: 'completed' as const,
      score: null,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const user = {
      id: userId,
      organizationId,
      email,
      firstName: 'Learner',
      lastName: 'User',
      middleName: null,
      position: null,
      shift: null,
      phone: null,
      status: 'active' as const,
      locale: 'en',
      timezone: 'UTC',
      passwordHash,
    };
    const certificate = {
      id: certificateId,
      organizationId,
      courseId,
      userId,
      assessmentAttemptId: null,
      status: 'issued' as const,
      issuedAt: timestamp,
      revokedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    prisma.organization.findFirst.setResolvedValue({ id: organizationId });
    prisma.user.findFirst.setResolvedValue(user);
    prisma.membership.findMany.setResolvedValue([{ role: 'admin' }]);
    prisma.session.create.setResolvedValue({ id: 'session-id' });
    prisma.session.findFirst.setResolvedValue({ id: 'session-id' });
    prisma.course.findFirst.setResolvedValue({ id: courseId });
    prisma.course.findUnique.setResolvedValue(null);
    prisma.course.create.setResolvedValue(course);
    prisma.lesson.findUnique.setResolvedValue(null);
    prisma.lesson.findFirst.setResolvedValue({ id: lessonId });
    prisma.lesson.create.setResolvedValue(lesson);
    prisma.assignment.create.setResolvedValue(assignment);
    prisma.progress.findFirst.setResolvedValue(null);
    prisma.progress.create.setResolvedValue(progress);
    prisma.lesson.count.setResolvedValue(1);
    prisma.progress.count.setResolvedValue(1);
    prisma.assessmentAttempt.findFirst.setResolvedValue(null);
    prisma.certificate.findFirst.setResolvedValue(null);
    prisma.certificate.create.setResolvedValue(certificate);

    await expect(
      authService.login({
        organizationId,
        email,
        password,
      }),
    ).resolves.toMatchObject({
      tokenType: 'Bearer',
      user: { id: userId, organizationId, email, roles: ['admin'] },
    });

    await expect(
      coursesService.createCourse({
        organizationId,
        title: course.title,
        slug: course.slug,
        status: course.status,
      }),
    ).resolves.toEqual(course);

    await expect(
      lessonsService.createLesson({
        organizationId,
        courseId,
        title: lesson.title,
        slug: lesson.slug,
        order: lesson.order,
        status: lesson.status,
      }),
    ).resolves.toEqual(lesson);

    await expect(
      assignmentsService.createAssignment({
        organizationId,
        courseId,
        userId,
        status: assignment.status,
      }),
    ).resolves.toEqual(assignment);

    await expect(
      progressService.createProgress({
        organizationId,
        courseId,
        lessonId,
        userId,
        status: progress.status,
        completedAt: timestamp,
      }),
    ).resolves.toEqual(progress);

    await expect(coursesService.getCourseCompletion(courseId, userId, organizationId)).resolves.toMatchObject({
      courseId,
      userId,
      totalLessons: 1,
      completedLessons: 1,
      isCompleted: true,
      percentage: 100,
    });

    await expect(
      certificatesService.issueCertificate(
        {
          organizationId,
          courseId,
          userId,
        },
        userId,
      ),
    ).resolves.toEqual(certificate);
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

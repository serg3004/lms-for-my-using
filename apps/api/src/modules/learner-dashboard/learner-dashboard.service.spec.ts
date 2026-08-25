import { PrismaService } from '../../database/prisma.service.js';
import { LearnerDashboardService } from './learner-dashboard.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const actor = { id: userId, organizationId };

type Call = { resource: string; method: string; args: Record<string, unknown> };

function createPrismaSpy(overrides: {
  coursesCount?: number;
  pendingAssignmentsCount?: number;
  availableAssessmentsCount?: number;
  certificatesCount?: number;
  completedProgress?: unknown[];
  upcomingAssignments?: unknown[];
  recentCertificates?: unknown[];
  recentCompletedLessons?: unknown[];
  lessonCounts?: unknown[];
} = {}) {
  const calls: Call[] = [];
  let progressFindManyCallIndex = 0;

  const prisma = {
    course: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'course', method: 'count', args });
        return overrides.coursesCount ?? 0;
      },
    },
    assignment: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'assignment', method: 'count', args });
        return overrides.pendingAssignmentsCount ?? 0;
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'assignment', method: 'findMany', args });
        return overrides.upcomingAssignments ?? [];
      },
    },
    assessment: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'assessment', method: 'count', args });
        return overrides.availableAssessmentsCount ?? 0;
      },
    },
    certificate: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'certificate', method: 'count', args });
        return overrides.certificatesCount ?? 0;
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'certificate', method: 'findMany', args });
        return overrides.recentCertificates ?? [];
      },
    },
    progress: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'progress', method: 'findMany', args });
        progressFindManyCallIndex += 1;
        return progressFindManyCallIndex === 1
          ? overrides.completedProgress ?? []
          : overrides.recentCompletedLessons ?? [];
      },
    },
    lesson: {
      groupBy: async (args: Record<string, unknown>) => {
        calls.push({ resource: 'lesson', method: 'groupBy', args });
        return overrides.lessonCounts ?? [];
      },
    },
  } as unknown as PrismaService;

  return { prisma, calls };
}

describe('LearnerDashboardService', () => {
  it('returns dashboard stats and skips the lesson-count query when there is no completed progress', async () => {
    const { prisma, calls } = createPrismaSpy({
      coursesCount: 12,
      pendingAssignmentsCount: 3,
      availableAssessmentsCount: 4,
      certificatesCount: 2,
    });
    const service = new LearnerDashboardService(prisma);

    const result = await service.getLearnerDashboard(actor);

    expect(result).toEqual({
      coursesCount: 12,
      pendingAssignmentsCount: 3,
      availableAssessmentsCount: 4,
      certificatesCount: 2,
      continueLearning: [],
      upcomingDeadlines: [],
      recentActivity: [],
    });
    expect(calls.some((call) => call.resource === 'lesson' && call.method === 'groupBy')).toBe(false);
  });

  it('ranks continue-learning courses by latest completion and totals lessons in one query', async () => {
    const courseA = { id: 'course-a', title: 'Course A' };
    const courseB = { id: 'course-b', title: 'Course B' };
    const { prisma } = createPrismaSpy({
      completedProgress: [
        { courseId: 'course-b', lessonId: 'lesson-b1', completedAt: new Date('2026-01-02T00:00:00.000Z'), course: courseB },
        { courseId: 'course-a', lessonId: 'lesson-a1', completedAt: new Date('2026-01-03T00:00:00.000Z'), course: courseA },
        { courseId: 'course-a', lessonId: 'lesson-a2', completedAt: new Date('2026-01-01T00:00:00.000Z'), course: courseA },
      ],
      lessonCounts: [
        { courseId: 'course-a', _count: { _all: 5 } },
        { courseId: 'course-b', _count: { _all: 3 } },
      ],
    });
    const service = new LearnerDashboardService(prisma);

    const result = await service.getLearnerDashboard(actor);

    expect(result.continueLearning).toEqual([
      { courseId: 'course-a', courseTitle: 'Course A', completedLessons: 2, totalLessons: 5 },
      { courseId: 'course-b', courseTitle: 'Course B', completedLessons: 1, totalLessons: 3 },
    ]);
  });

  it('merges upcoming deadlines and recent activity from a single dashboard call', async () => {
    const { prisma } = createPrismaSpy({
      upcomingAssignments: [
        { id: 'assignment-1', dueAt: new Date('2026-06-01T00:00:00.000Z'), course: { id: 'course-a', title: 'Course A' } },
      ],
      recentCertificates: [
        { id: 'certificate-1', issuedAt: new Date('2026-01-05T00:00:00.000Z'), course: { id: 'course-a', title: 'Course A' } },
      ],
      recentCompletedLessons: [
        { id: 'progress-1', completedAt: new Date('2026-01-06T00:00:00.000Z'), course: { id: 'course-a', title: 'Course A' } },
      ],
    });
    const service = new LearnerDashboardService(prisma);

    const result = await service.getLearnerDashboard(actor);

    expect(result.upcomingDeadlines).toEqual([
      { id: 'assignment-1', courseTitle: 'Course A', dueAt: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(result.recentActivity).toEqual([
      { type: 'lesson_completed', id: 'progress-1', date: '2026-01-06T00:00:00.000Z', courseTitle: 'Course A' },
      { type: 'certificate_issued', id: 'certificate-1', date: '2026-01-05T00:00:00.000Z', courseTitle: 'Course A' },
    ]);
  });
});

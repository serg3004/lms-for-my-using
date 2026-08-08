import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { createProgressSchema } from './progress.schemas.js';
import { ProgressService } from './progress.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const userId = '33333333-3333-3333-3333-333333333333';
const courseAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('ProgressService getProgressSummary', () => {
  const buildService = () => {
    const prisma = {
      progress: {
        findMany: async () => [
          {
            courseId: courseAId,
            lessonId: 'lesson-a1',
            status: 'completed',
            completedAt: daysAgo(1),
            course: { title: 'Course A' },
          },
          {
            courseId: courseAId,
            lessonId: 'lesson-a2',
            status: 'completed',
            completedAt: daysAgo(10),
            course: { title: 'Course A' },
          },
          {
            courseId: courseBId,
            lessonId: 'lesson-b1',
            status: 'completed',
            completedAt: daysAgo(40),
            course: { title: 'Course B' },
          },
          {
            courseId: courseBId,
            lessonId: 'lesson-b2',
            status: 'in_progress',
            completedAt: null,
            course: { title: 'Course B' },
          },
        ],
      },
      assessmentAttempt: {
        findMany: async () => [
          {
            id: 'attempt-1',
            percentage: 80,
            completedAt: daysAgo(2),
            assessment: { courseId: courseAId, title: 'Course A Test' },
          },
        ],
      },
      certificate: {
        findMany: async () => [
          {
            id: 'cert-1',
            issuedAt: daysAgo(3),
            course: { id: courseAId, title: 'Course A' },
          },
        ],
      },
      lesson: {
        groupBy: async () => [
          { courseId: courseAId, _count: { _all: 2 } },
          { courseId: courseBId, _count: { _all: 2 } },
        ],
      },
    } as unknown as PrismaService;

    return new ProgressService(prisma);
  };

  it('aggregates course progress, activity and streak within a 30-day period', async () => {
    const service = buildService();

    const summary = await service.getProgressSummary({ id: userId, organizationId, roles: ['learner'] }, 30);

    expect(summary.period).toBe(30);
    expect(summary.lessonsCompletedCount).toBe(2);
    expect(summary.avgAssessmentScore).toBe(80);
    expect(summary.weeklyGoal.target).toBe(3);
    expect(summary.streak).toHaveLength(7);

    const courseA = summary.courses.find((c) => c.courseId === courseAId);
    const courseB = summary.courses.find((c) => c.courseId === courseBId);
    expect(courseA).toEqual({
      courseId: courseAId,
      title: 'Course A',
      completedLessons: 2,
      totalLessons: 2,
      percentage: 100,
      status: 'completed',
      latestAssessmentScore: 80,
    });
    expect(courseB).toEqual({
      courseId: courseBId,
      title: 'Course B',
      completedLessons: 1,
      totalLessons: 2,
      percentage: 50,
      status: 'in_progress',
      latestAssessmentScore: null,
    });

    expect(summary.overallProgressPercent).toBe(75);
    expect(summary.recentActivity.length).toBeGreaterThan(0);
    expect(summary.recentActivity[0].type).toBeDefined();
  });

  it('excludes activity older than the selected period from time-windowed stats', async () => {
    const service = buildService();

    const summary = await service.getProgressSummary({ id: userId, organizationId, roles: ['learner'] }, 30);

    const courseBActivity = summary.recentActivity.find((item) => item.courseId === courseBId);
    expect(courseBActivity).toBeUndefined();
  });
});

describe('Progress validation', () => {
  it('accepts valid progress input without lesson', () => {
    const input = createProgressSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'in_progress',
    });
  });

  it('accepts valid progress input with lesson, score, and completion date', () => {
    const input = createProgressSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '44444444-4444-4444-4444-444444444444',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'completed',
      score: 95,
      completedAt: '2026-06-01T09:00:00.000Z',
    });

    expect(input.lessonId).toBe('44444444-4444-4444-4444-444444444444');
    expect(input.score).toBe(95);
    expect(input.completedAt).toEqual(new Date('2026-06-01T09:00:00.000Z'));
  });

  it('rejects progress input without user', () => {
    expect(() =>
      createProgressSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toThrow();
  });

  it('rejects invalid progress score', () => {
    expect(() =>
      createProgressSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        courseId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        score: 101,
      }),
    ).toThrow();
  });

  it('accepts completed status with completedAt for lesson marking', () => {
    const now = new Date().toISOString();
    const input = createProgressSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      courseId: '22222222-2222-2222-2222-222222222222',
      lessonId: '44444444-4444-4444-4444-444444444444',
      userId: '33333333-3333-3333-3333-333333333333',
      status: 'completed',
      completedAt: now,
    });
    expect(input.status).toBe('completed');
    expect(input.completedAt).toBeInstanceOf(Date);
  });
});

describe('ProgressService createProgress — learner access without an admin/manager/instructor actor', () => {
  const learnerActor = { id: userId, organizationId, roles: ['learner'] as const };
  const baseInput = {
    organizationId,
    courseId: courseAId,
    userId,
    status: 'in_progress' as const,
  };

  function buildPrisma(overrides: {
    selfEnrollmentEnabled?: boolean;
    assignment?: unknown;
  }) {
    const created = { id: 'progress-1', ...baseInput };
    return {
      course: {
        findFirst: async () => ({ id: courseAId, selfEnrollmentEnabled: overrides.selfEnrollmentEnabled ?? false }),
      },
      user: {
        findFirst: async () => ({ id: userId }),
      },
      assignment: {
        findFirst: async () => overrides.assignment ?? null,
      },
      progress: {
        findFirst: async () => null,
        create: async () => created,
      },
    } as unknown as PrismaService;
  }

  it('rejects when the learner has no assignment and the course does not allow self-enrollment', async () => {
    const service = new ProgressService(buildPrisma({}));

    await expect(service.createProgress(baseInput, learnerActor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the learner when directly assigned to the course', async () => {
    const service = new ProgressService(buildPrisma({ assignment: { id: 'assignment-1' } }));

    await expect(service.createProgress(baseInput, learnerActor)).resolves.toMatchObject({ id: 'progress-1' });
  });

  it('allows the learner when the course has self-enrollment enabled, without checking assignments', async () => {
    const assignmentFindFirst = jest.fn(async () => null);
    const prisma = buildPrisma({ selfEnrollmentEnabled: true });
    (prisma as unknown as { assignment: { findFirst: typeof assignmentFindFirst } }).assignment.findFirst = assignmentFindFirst;
    const service = new ProgressService(prisma);

    await expect(service.createProgress(baseInput, learnerActor)).resolves.toMatchObject({ id: 'progress-1' });
    expect(assignmentFindFirst).not.toHaveBeenCalled();
  });

  it('does not require an assignment for non-learner actors (e.g. instructor recording progress manually)', async () => {
    const assignmentFindFirst = jest.fn(async () => null);
    const prisma = buildPrisma({});
    (prisma as unknown as { assignment: { findFirst: typeof assignmentFindFirst } }).assignment.findFirst = assignmentFindFirst;
    const service = new ProgressService(prisma);
    const instructorActor = { id: 'instructor-1', organizationId, roles: ['instructor'] as const };

    await expect(service.createProgress(baseInput, instructorActor)).resolves.toMatchObject({ id: 'progress-1' });
    expect(assignmentFindFirst).not.toHaveBeenCalled();
  });
});

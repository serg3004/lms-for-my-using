import { PrismaService } from '../../database/prisma.service.js';
import { ManagerService } from './manager.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const managerId = '22222222-2222-2222-2222-222222222222';
const memberAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const memberBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const courseAId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const courseBId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe('ManagerService getTeamSummary', () => {
  it('returns zeroed summary when the manager has no team members', async () => {
    const prisma = {
      user: { findMany: async () => [] },
    } as unknown as PrismaService;
    const service = new ManagerService(prisma);

    await expect(service.getTeamSummary({ id: managerId, organizationId, roles: ['manager'] })).resolves.toEqual({
      membersCount: 0,
      completionRate: 0,
      dueThisWeekCount: 0,
      overdueCount: 0,
      avgTeamScore: null,
      upcomingDeadlines: [],
      members: [],
    });
  });

  it('aggregates per-member completion, risk status, overdue and due-this-week counts', async () => {
    const prisma = {
      user: {
        findMany: async () => [
          { id: memberAId, firstName: 'Alex', lastName: 'A', email: 'a@demo.com' },
          { id: memberBId, firstName: 'Bob', lastName: 'B', email: 'b@demo.com' },
        ],
      },
      progress: {
        findMany: async () => [
          { userId: memberAId, courseId: courseAId, lessonId: 'lesson-1', status: 'completed' },
          { userId: memberAId, courseId: courseAId, lessonId: 'lesson-2', status: 'completed' },
          { userId: memberBId, courseId: courseBId, lessonId: 'lesson-3', status: 'completed' },
          { userId: memberBId, courseId: courseBId, lessonId: 'lesson-4', status: 'in_progress' },
        ],
      },
      assessmentAttempt: {
        findMany: async () => [{ percentage: 90 }, { percentage: 70 }],
      },
      assignment: {
        findMany: async () => [
          { userId: memberAId, status: 'assigned', dueAt: daysFromNow(-1), course: { title: 'Course A' } },
          { userId: memberBId, status: 'assigned', dueAt: daysFromNow(3), course: { title: 'Course B' } },
        ],
      },
      lesson: {
        groupBy: async () => [
          { courseId: courseAId, _count: { _all: 2 } },
          { courseId: courseBId, _count: { _all: 4 } },
        ],
      },
    } as unknown as PrismaService;
    const service = new ManagerService(prisma);

    const summary = await service.getTeamSummary({ id: managerId, organizationId, roles: ['manager'] });

    expect(summary.membersCount).toBe(2);
    expect(summary.dueThisWeekCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.avgTeamScore).toBe(80);
    expect(summary.upcomingDeadlines).toEqual([{ courseTitle: 'Course B', userId: memberBId, dueAt: expect.any(String) }]);

    const memberA = summary.members.find((m) => m.userId === memberAId);
    const memberB = summary.members.find((m) => m.userId === memberBId);

    expect(memberA).toEqual({
      userId: memberAId,
      firstName: 'Alex',
      lastName: 'A',
      email: 'a@demo.com',
      activeCoursesCount: 1,
      completionPercent: 100,
      status: 'risk',
    });
    expect(memberB).toEqual({
      userId: memberBId,
      firstName: 'Bob',
      lastName: 'B',
      email: 'b@demo.com',
      activeCoursesCount: 1,
      completionPercent: 25,
      status: 'risk',
    });

    expect(summary.completionRate).toBe(50);
  });
});

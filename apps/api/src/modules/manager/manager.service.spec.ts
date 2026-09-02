import { jest } from '@jest/globals';

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
      progress: { findMany: async () => [] },
      assessmentAttempt: { findMany: async () => [] },
      assignment: { findMany: async () => [] },
      lesson: { groupBy: async () => [] },
      departmentManager: { findMany: async () => [] },
      $queryRaw: async () => [],
    } as unknown as PrismaService;
    const service = new ManagerService(prisma);

    await expect(service.getTeamSummary({ id: managerId, organizationId, roles: ['manager'] })).resolves.toEqual({
      membersCount: 0,
      completionRate: 0,
      dueThisWeekCount: 0,
      overdueCount: 0,
      avgTeamScore: null,
      upcomingDeadlines: [],
      overdueAssignments: [],
      members: [],
    });
  });

  it('aggregates per-member completion, risk status, overdue and due-this-week counts', async () => {
    let assignmentWhere: unknown;
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
        findMany: async (args: { where: unknown }) => {
          assignmentWhere = args.where;
          return [
          { id: 'assignment-a', userId: memberAId, groupId: null, status: 'assigned', dueAt: daysFromNow(-1), course: { title: 'Course A' }, group: null },
          { id: 'assignment-b', userId: memberBId, groupId: null, status: 'assigned', dueAt: daysFromNow(3), course: { title: 'Course B' }, group: null },
          { id: 'assignment-group', userId: null, groupId: 'group-a', status: 'assigned', dueAt: daysFromNow(-2), course: { title: 'Course A' }, group: { name: 'Warehouse' } },
          ];
        },
      },
      lesson: {
        groupBy: async () => [
          { courseId: courseAId, _count: { _all: 2 } },
          { courseId: courseBId, _count: { _all: 4 } },
        ],
      },
      departmentManager: { findMany: async () => [] },
      $queryRaw: async () => [],
    } as unknown as PrismaService;
    const service = new ManagerService(prisma);

    const summary = await service.getTeamSummary({ id: managerId, organizationId, roles: ['manager'] });

    expect(summary.membersCount).toBe(2);
    expect(summary.dueThisWeekCount).toBe(1);
    expect(summary.overdueCount).toBe(2);
    expect(summary.avgTeamScore).toBe(80);
    expect(summary.upcomingDeadlines).toEqual([{ courseTitle: 'Course B', userId: memberBId, dueAt: expect.any(String) }]);
    expect(summary.overdueAssignments).toEqual([
      { assignmentId: 'assignment-group', courseTitle: 'Course A', userId: null, groupId: 'group-a', groupName: 'Warehouse', dueAt: expect.any(String) },
      { assignmentId: 'assignment-a', courseTitle: 'Course A', userId: memberAId, groupId: null, groupName: null, dueAt: expect.any(String) },
    ]);

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
    expect(assignmentWhere).toEqual({
      organizationId,
      deletedAt: null,
      OR: [
        {
          user: {
            groupMemberships: {
              some: {
                organizationId,
                deletedAt: null,
                group: {
                  organizationId,
                  status: 'active',
                  deletedAt: null,
                  managers: { some: { managerId, organizationId, deletedAt: null } },
                },
              },
            },
          },
        },
        {
          group: {
            organizationId,
            status: 'active',
            deletedAt: null,
            managers: { some: { managerId, organizationId, deletedAt: null } },
          },
        },
      ],
    });
  });
});

describe('ManagerService sendOverdueReminders', () => {
  it('creates notifications for direct and group recipients and reports inaccessible rows', async () => {
    const notificationCreateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      assignment: { findMany: jest.fn(async () => [
        { id: 'direct', userId: memberAId, course: { title: 'Safety' }, group: null },
        { id: 'group', userId: null, course: { title: 'Compliance' }, group: { members: [{ userId: memberAId }, { userId: memberBId }] } },
      ]) },
      notification: { createMany: notificationCreateMany },
      departmentManager: { findMany: async () => [] },
      $queryRaw: async () => [],
    } as unknown as PrismaService;
    const service = new ManagerService(prisma);

    const result = await service.sendOverdueReminders(
      { id: managerId, organizationId, roles: ['manager'] },
      ['direct', 'group', 'outside'],
    );

    expect(result).toMatchObject({ sent: 2, failed: 1 });
    expect(result.results[2]).toEqual({ assignmentId: 'outside', status: 'failed', reason: 'not_applicable' });
    expect(notificationCreateMany).toHaveBeenCalledTimes(2);
    expect(notificationCreateMany).toHaveBeenLastCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ userId: memberAId, type: 'manager_overdue_reminder' }),
      expect.objectContaining({ userId: memberBId, type: 'manager_overdue_reminder' }),
    ]) });
    expect((prisma.assignment.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      organizationId,
      status: 'assigned',
      dueAt: { lt: expect.any(Date) },
    });
  });

  it('does not create a notification when a scoped group has no active recipients', async () => {
    const notificationCreateMany = jest.fn();
    const prisma = {
      assignment: { findMany: async () => [{ id: 'group', userId: null, course: { title: 'Safety' }, group: { members: [] } }] },
      notification: { createMany: notificationCreateMany },
    } as unknown as PrismaService;

    await expect(new ManagerService(prisma).sendOverdueReminders(organizationId, ['group'])).resolves.toMatchObject({ sent: 0, failed: 1 });
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });
});

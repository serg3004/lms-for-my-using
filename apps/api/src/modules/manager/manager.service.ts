import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RISK_COMPLETION_THRESHOLD = 50;
const DUE_SOON_WINDOW_DAYS = 7;
const UPCOMING_DEADLINES_LIMIT = 5;

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async getTeamSummary(actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const now = new Date();
    const dueSoonAt = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * MS_PER_DAY);

    const teamUsers = await this.prisma.user.findMany({
      where: { organizationId, ...this.teamScope.user(actor), deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });
    const memberIds = teamUsers.map((user) => user.id);

    const [progressRows, attemptRows, assignmentRows] = await Promise.all([
      this.prisma.progress.findMany({
        where: {
          organizationId,
          userId: { in: memberIds },
          deletedAt: null,
          lessonId: { not: null },
          lesson: { status: 'published', deletedAt: null },
        },
        select: { userId: true, courseId: true, lessonId: true, status: true },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { organizationId, userId: { in: memberIds }, deletedAt: null, completedAt: { not: null } },
        select: { percentage: true },
      }),
      this.prisma.assignment.findMany({
        where: { organizationId, ...this.teamScope.assignment(actor), deletedAt: null },
        select: {
          id: true,
          userId: true,
          groupId: true,
          status: true,
          dueAt: true,
          course: { select: { title: true } },
          group: { select: { name: true } },
        },
      }),
    ]);

    const startedCourseIdsByUser = new Map<string, Set<string>>();
    const completedLessonIdsByUserCourse = new Map<string, Map<string, Set<string>>>();
    for (const row of progressRows) {
      const started = startedCourseIdsByUser.get(row.userId) ?? new Set<string>();
      started.add(row.courseId);
      startedCourseIdsByUser.set(row.userId, started);

      if (row.status === 'completed') {
        const byCourse = completedLessonIdsByUserCourse.get(row.userId) ?? new Map<string, Set<string>>();
        const lessons = byCourse.get(row.courseId) ?? new Set<string>();
        lessons.add(row.lessonId as string);
        byCourse.set(row.courseId, lessons);
        completedLessonIdsByUserCourse.set(row.userId, byCourse);
      }
    }

    const allStartedCourseIds = [...new Set(progressRows.map((row) => row.courseId))];
    const totalLessonsByCourse = await this.prisma.lesson.groupBy({
      by: ['courseId'],
      where: { organizationId, courseId: { in: allStartedCourseIds }, status: 'published', deletedAt: null },
      _count: { _all: true },
    });
    const totalLessonsByCourseId = new Map(totalLessonsByCourse.map((row) => [row.courseId, row._count._all]));

    const overdueByUser = new Map<string, number>();
    const dueThisWeekByUser = new Map<string, number>();
    let overdueCount = 0;
    let dueThisWeekCount = 0;
    const upcomingDeadlines: { courseTitle: string; userId: string; dueAt: string }[] = [];
    const overdueAssignments: {
      assignmentId: string;
      courseTitle: string;
      userId: string | null;
      groupId: string | null;
      groupName: string | null;
      dueAt: string;
    }[] = [];

    for (const assignment of assignmentRows) {
      if (assignment.status === 'completed' || !assignment.dueAt) continue;

      if (assignment.dueAt < now) {
        overdueCount += 1;
        if (assignment.userId) {
          overdueByUser.set(assignment.userId, (overdueByUser.get(assignment.userId) ?? 0) + 1);
        }
        overdueAssignments.push({
          assignmentId: assignment.id,
          courseTitle: assignment.course.title,
          userId: assignment.userId,
          groupId: assignment.groupId,
          groupName: assignment.group?.name ?? null,
          dueAt: assignment.dueAt.toISOString(),
        });
      } else if (assignment.dueAt <= dueSoonAt && assignment.userId) {
        dueThisWeekCount += 1;
        dueThisWeekByUser.set(assignment.userId, (dueThisWeekByUser.get(assignment.userId) ?? 0) + 1);
        upcomingDeadlines.push({ courseTitle: assignment.course.title, userId: assignment.userId, dueAt: assignment.dueAt.toISOString() });
      }
    }
    upcomingDeadlines.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
    overdueAssignments.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));

    let teamCompletedLessons = 0;
    let teamTotalLessons = 0;

    const members = teamUsers.map((user) => {
      const startedCourseIds = [...(startedCourseIdsByUser.get(user.id) ?? new Set<string>())];
      const completedByCourse = completedLessonIdsByUserCourse.get(user.id) ?? new Map<string, Set<string>>();

      let completedLessons = 0;
      let totalLessons = 0;
      for (const courseId of startedCourseIds) {
        completedLessons += completedByCourse.get(courseId)?.size ?? 0;
        totalLessons += totalLessonsByCourseId.get(courseId) ?? 0;
      }
      teamCompletedLessons += completedLessons;
      teamTotalLessons += totalLessons;

      const completionPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      const hasOverdue = (overdueByUser.get(user.id) ?? 0) > 0;
      const status: 'good' | 'risk' = completionPercent < RISK_COMPLETION_THRESHOLD || hasOverdue ? 'risk' : 'good';

      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        activeCoursesCount: startedCourseIds.length,
        completionPercent,
        status,
      };
    });

    const completionRate = teamTotalLessons > 0 ? Math.round((teamCompletedLessons / teamTotalLessons) * 100) : 0;
    const avgTeamScore =
      attemptRows.length > 0 ? Math.round(attemptRows.reduce((sum, attempt) => sum + attempt.percentage, 0) / attemptRows.length) : null;

    return {
      membersCount: teamUsers.length,
      completionRate,
      dueThisWeekCount,
      overdueCount,
      avgTeamScore,
      upcomingDeadlines: upcomingDeadlines.slice(0, UPCOMING_DEADLINES_LIMIT),
      overdueAssignments,
      members,
    };
  }

  async sendOverdueReminders(actorInput: TeamScopeActor | string, assignmentIds: string[]) {
    const actor = normalizeActor(actorInput);
    const now = new Date();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        id: { in: assignmentIds },
        organizationId: actor.organizationId,
        ...this.teamScope.assignment(actor),
        deletedAt: null,
        status: 'assigned',
        dueAt: { lt: now },
      },
      select: {
        id: true,
        course: { select: { title: true } },
        userId: true,
        group: {
          select: {
            members: {
              where: { organizationId: actor.organizationId, deletedAt: null, user: { deletedAt: null } },
              select: { userId: true },
            },
          },
        },
      },
    });
    const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const results: { assignmentId: string; status: 'sent' | 'failed'; recipients?: number; reason?: 'not_applicable' | 'no_recipients' }[] = [];

    for (const assignmentId of assignmentIds) {
      const assignment = byId.get(assignmentId);
      if (!assignment) {
        results.push({ assignmentId, status: 'failed', reason: 'not_applicable' });
        continue;
      }
      const recipientIds = [...new Set(assignment.userId ? [assignment.userId] : (assignment.group?.members ?? []).map((item) => item.userId))];
      if (recipientIds.length === 0) {
        results.push({ assignmentId, status: 'failed', reason: 'no_recipients' });
        continue;
      }
      await this.prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          organizationId: actor.organizationId,
          userId,
          type: 'manager_overdue_reminder',
          data: { assignmentId, courseTitle: assignment.course.title },
          link: `/learn/assignments/${assignmentId}`,
        })),
      });
      results.push({ assignmentId, status: 'sent', recipients: recipientIds.length });
    }

    return {
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
      results,
    };
  }
}

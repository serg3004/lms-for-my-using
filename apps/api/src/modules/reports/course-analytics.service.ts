import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { getSubtreeDepartmentIds } from '../departments/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { OrganizationAccessScopeService } from '../organization-access-scope/public.js';
import {
  buildCourseUserRows,
  summarizeCourses,
  summarizeUser,
  type CourseAnalyticsInput,
  type CourseUserRow,
} from './course-analytics.js';
import type { CourseAnalyticsQuery } from './reports.schemas.js';

/** Upper bound of (course, user) rows read in one request; the answer says `truncated` when it was hit. */
export const COURSE_ANALYTICS_MAX_ROWS = 5000;

type Scope = { courseId?: string; userId?: string };

/**
 * PR 473: course and user analytics. Admin sees the whole organization, a manager only their team
 * (the same scope as the existing reports), an instructor only the courses they teach.
 */
@Injectable()
export class CourseAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
    private readonly orgAccessScope: OrganizationAccessScopeService = new OrganizationAccessScopeService(prisma, teamScope),
  ) {}

  async getCourses(actor: TeamScopeActor, query: CourseAnalyticsQuery) {
    const data = await this.load(actor, query, {});
    const summaries = summarizeCourses(data.rows);
    const titles = new Map(data.courses.map((course) => [course.id, course.title]));
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      durationBasis: 'calendar' as const,
      truncated: data.truncated,
      courses: summaries.map((summary) => ({ ...summary, title: titles.get(summary.courseId) ?? '' })),
    };
  }

  async getCourseReport(actor: TeamScopeActor, courseId: string, query: CourseAnalyticsQuery) {
    const data = await this.load(actor, query, { courseId });
    const course = data.courses.find((candidate) => candidate.id === courseId);
    if (!course) throw new NotFoundException('Course not found');
    const [summary] = summarizeCourses(data.rows);
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      durationBasis: 'calendar' as const,
      truncated: data.truncated,
      course: { id: course.id, title: course.title },
      summary: summary ?? null,
      rows: data.rows.map((row) => ({ ...row, user: data.users.get(row.userId) ?? null })),
    };
  }

  async getUserReport(actor: TeamScopeActor, userId: string, query: CourseAnalyticsQuery) {
    const isManager = !actor.roles.includes('admin') && actor.roles.includes('manager');
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId, organizationId: actor.organizationId, deletedAt: null }, ...(isManager ? [await this.orgAccessScope.user(actor)] : [])] },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const data = await this.load(actor, query, { userId });
    const titles = new Map(data.courses.map((course) => [course.id, course.title]));
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      durationBasis: 'calendar' as const,
      truncated: data.truncated,
      user,
      summary: summarizeUser(data.rows),
      rows: data.rows.map((row) => ({ ...row, courseTitle: titles.get(row.courseId) ?? '' })),
    };
  }

  private async load(actor: TeamScopeActor, query: CourseAnalyticsQuery, scope: Scope) {
    const organizationId = actor.organizationId;
    const isAdmin = actor.roles.includes('admin');
    const isManager = !isAdmin && actor.roles.includes('manager');
    const instructorOnly = !isAdmin && !isManager;

    const courseWhere: Prisma.CourseWhereInput = {
      organizationId,
      deletedAt: null,
      ...(scope.courseId ? { id: scope.courseId } : {}),
      ...(query.courseIds?.length ? { id: scope.courseId ?? { in: query.courseIds } } : {}),
      ...(instructorOnly ? { instructors: { some: { instructorId: actor.id, organizationId, deletedAt: null } } } : {}),
    };
    const courses = await this.prisma.course.findMany({ where: courseWhere, select: { id: true, title: true }, orderBy: [{ title: 'asc' }, { id: 'asc' }] });
    const empty = { courses, rows: [] as CourseUserRow[], users: new Map<string, UserInfo>(), truncated: false };
    if (courses.length === 0) return empty;
    const courseIds = courses.map((course) => course.id);

    // Users the viewer may see, narrowed by the department, group and manager filters.
    const userAnd: Prisma.UserWhereInput[] = [{ organizationId, deletedAt: null }];
    if (isManager) userAnd.push(await this.orgAccessScope.user(actor));
    if (scope.userId) userAnd.push({ id: scope.userId });
    if (query.departmentId) userAnd.push(await this.departmentPopulation(organizationId, query.departmentId, query.includeDescendants));
    if (query.groupId) userAnd.push({ groupMemberships: { some: { organizationId, groupId: query.groupId, deletedAt: null } } });
    if (query.managerId) {
      userAnd.push({
        groupMemberships: {
          some: { organizationId, deletedAt: null, group: { deletedAt: null, managers: { some: { managerId: query.managerId, organizationId, deletedAt: null } } } },
        },
      });
    }
    const userWhere: Prisma.UserWhereInput = { AND: userAnd };

    const assignmentRows = await this.prisma.assignment.findMany({
      where: {
        organizationId,
        courseId: { in: courseIds },
        deletedAt: null,
        status: { not: 'cancelled' },
        ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
      },
      select: { courseId: true, userId: true, groupId: true, departmentId: true, includeDescendants: true, dueAt: true, status: true },
    });

    const groupIds = [...new Set(assignmentRows.flatMap((row) => (row.groupId ? [row.groupId] : [])))];
    const members = groupIds.length === 0 ? [] : await this.prisma.groupMember.findMany({
      where: { organizationId, groupId: { in: groupIds }, deletedAt: null },
      select: { groupId: true, userId: true },
    });
    const membersByGroup = new Map<string, string[]>();
    for (const member of members) membersByGroup.set(member.groupId, [...(membersByGroup.get(member.groupId) ?? []), member.userId]);

    const departmentAssignments = assignmentRows.filter((row) => row.departmentId);
    const usersByDepartmentAssignment = new Map<string, string[]>();
    for (const row of departmentAssignments) {
      const mapKey = `${row.departmentId}:${row.includeDescendants}`;
      if (usersByDepartmentAssignment.has(mapKey)) continue;
      const departmentIds = row.includeDescendants ? await getSubtreeDepartmentIds(this.prisma, [row.departmentId!], organizationId) : [row.departmentId!];
      const memberships = await this.prisma.departmentMembership.findMany({
        where: { organizationId, departmentId: { in: departmentIds }, isPrimary: true, effectiveTo: null },
        select: { userId: true },
      });
      usersByDepartmentAssignment.set(mapKey, memberships.map((membership) => membership.userId));
    }

    const expanded: CourseAnalyticsInput['assignments'][number][] = [];
    for (const row of assignmentRows) {
      const userIds = row.userId ? [row.userId] : row.groupId ? membersByGroup.get(row.groupId) ?? [] : usersByDepartmentAssignment.get(`${row.departmentId}:${row.includeDescendants}`) ?? [];
      for (const userId of userIds) expanded.push({ courseId: row.courseId, userId, dueAt: row.dueAt, completed: row.status === 'completed' });
    }
    const candidateIds = [...new Set(expanded.map((row) => row.userId))];
    if (candidateIds.length === 0) return empty;

    const userRows = await this.prisma.user.findMany({
      where: { AND: [userWhere, { id: { in: candidateIds } }] },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const users = new Map<string, UserInfo>(userRows.map((user) => [user.id, user]));
    const allowed = expanded.filter((row) => users.has(row.userId));
    const seen = new Set<string>();
    let truncated = false;
    const limited = allowed.filter((row) => {
      const pair = `${row.courseId}:${row.userId}`;
      if (seen.has(pair)) return true;
      if (seen.size >= COURSE_ANALYTICS_MAX_ROWS) { truncated = true; return false; }
      seen.add(pair);
      return true;
    });
    const userIds = [...new Set(limited.map((row) => row.userId))];
    const pairCourseIds = [...new Set(limited.map((row) => row.courseId))];
    if (userIds.length === 0) return { ...empty, truncated };

    const [lessons, assessments, progress, attempts, certificates] = await Promise.all([
      this.prisma.lesson.findMany({ where: { organizationId, courseId: { in: pairCourseIds }, deletedAt: null, status: 'published' }, select: { id: true, courseId: true } }),
      this.prisma.assessment.findMany({ where: { organizationId, courseId: { in: pairCourseIds }, deletedAt: null, status: 'published' }, select: { id: true, courseId: true } }),
      this.prisma.progress.findMany({
        where: { organizationId, courseId: { in: pairCourseIds }, userId: { in: userIds }, deletedAt: null },
        select: { courseId: true, userId: true, lessonId: true, status: true, createdAt: true, completedAt: true },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { organizationId, userId: { in: userIds }, deletedAt: null, countsTowardResults: true, assessment: { courseId: { in: pairCourseIds }, deletedAt: null, status: 'published' } },
        select: { assessmentId: true, userId: true, status: true, percentage: true, score: true, passed: true, startedAt: true, completedAt: true },
      }),
      this.prisma.certificate.findMany({
        where: { organizationId, courseId: { in: pairCourseIds }, userId: { in: userIds }, deletedAt: null },
        select: { courseId: true, userId: true, status: true, issuedAt: true },
      }),
    ]);

    const rows = buildCourseUserRows({ now: new Date(), assignments: limited, lessons, progress, assessments, attempts, certificates });
    rows.sort((a, b) => `${users.get(a.userId)?.lastName ?? ''}${users.get(a.userId)?.firstName ?? ''}`.localeCompare(`${users.get(b.userId)?.lastName ?? ''}${users.get(b.userId)?.firstName ?? ''}`, 'ru') || a.courseId.localeCompare(b.courseId));
    return { courses, rows, users, truncated };
  }

  private async departmentPopulation(organizationId: string, departmentId: string, includeDescendants: boolean): Promise<Prisma.UserWhereInput> {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } });
    if (!department) throw new NotFoundException('Department not found');
    const departmentIds = includeDescendants ? await getSubtreeDepartmentIds(this.prisma, [departmentId], organizationId) : [departmentId];
    return { departmentMemberships: { some: { organizationId, departmentId: { in: departmentIds }, isPrimary: true, effectiveTo: null } } };
  }
}

type UserInfo = { id: string; firstName: string; lastName: string; email: string };

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { isLearnerOnly } from '../auth/public.js';
import { ManagerTeamScope, normalizeActor, unrestrictedActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { CreateProgressInput } from './progress.schemas.js';

const progressSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  userId: true,
  status: true,
  score: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listProgress(actorInput: TeamScopeActor | string, userId: string | undefined, page: number, pageSize: number, instructorId?: string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId,
      ...(userId !== undefined ? { userId } : {}),
      ...(instructorId ? { course: { instructors: { some: { instructorId, organizationId, deletedAt: null } } } } : {}),
      ...this.teamScope.userOwnedResource(actor),
      deletedAt: null,
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.progress.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: progressSelect }),
      this.prisma.progress.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getProgress(progressId: string, actorInput: TeamScopeActor | string, userId?: string) {
    const actor = normalizeActor(actorInput);
    const progress = await this.prisma.progress.findFirst({
      where: {
        id: progressId,
        organizationId: actor.organizationId,
        ...this.teamScope.userOwnedResource(actor),
        ...(userId !== undefined ? { userId } : {}),
        deletedAt: null,
      },
      select: progressSelect,
    });

    if (!progress) {
      throw new NotFoundException('Progress not found');
    }

    return progress;
  }

  async createProgress(input: CreateProgressInput, actor: TeamScopeActor = unrestrictedActor(input.organizationId)) {
    const course = await this.ensureCourseExists(input.courseId, input.organizationId);
    await this.ensureUserExists(input.userId, input.organizationId, actor);

    if (isLearnerOnly(actor.roles)) {
      await this.ensureLearnerCanRecordProgress(input.courseId, input.userId, input.organizationId, course.selfEnrollmentEnabled);
    }

    if (input.lessonId) {
      await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, input.organizationId);
    }

    const existing = await this.prisma.progress.findFirst({
      where: {
        organizationId: input.organizationId,
        courseId: input.courseId,
        lessonId: input.lessonId ?? null,
        userId: input.userId,
        deletedAt: null,
      },
      select: progressSelect,
    });

    if (existing) {
      return existing;
    }

    return this.prisma.progress.create({
      data: input,
      select: progressSelect,
    });
  }

  private async ensureCourseExists(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, selfEnrollmentEnabled: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  // A learner may only record progress on a course they're actually assigned to (directly, or
  // via a group they belong to) — unless the course is explicitly opened up for self-paced access.
  // Without this, any learner could fabricate progress on any course in their org just by knowing
  // its id, including courses never assigned to them (see docs/CONCERNS.md).
  private async ensureLearnerCanRecordProgress(
    courseId: string,
    userId: string,
    organizationId: string,
    selfEnrollmentEnabled: boolean,
  ) {
    if (selfEnrollmentEnabled) return;

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        organizationId,
        courseId,
        deletedAt: null,
        status: { not: 'cancelled' },
        OR: [{ userId }, { group: { members: { some: { userId, organizationId, deletedAt: null } } } }],
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Course is not assigned to this user and does not allow self-enrollment');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string, actor: TeamScopeActor) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        ...this.teamScope.user(actor),
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureLessonBelongsToCourse(lessonId: string, courseId: string, organizationId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
  }

  async getProgressSummary(actorInput: TeamScopeActor | string, period: number) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const userId = actor.id;

    const now = new Date();
    const periodStart = new Date(now.getTime() - period * MS_PER_DAY);
    const weekStart = startOfWeekUtc(now);

    const [progressRows, attemptRows, certificateRows] = await Promise.all([
      this.prisma.progress.findMany({
        where: {
          organizationId,
          userId,
          deletedAt: null,
          lessonId: { not: null },
          lesson: { status: 'published', deletedAt: null },
        },
        select: {
          courseId: true,
          lessonId: true,
          status: true,
          completedAt: true,
          course: { select: { title: true } },
        },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: {
          organizationId,
          userId,
          deletedAt: null,
          completedAt: { not: null },
        },
        select: {
          id: true,
          percentage: true,
          completedAt: true,
          assessment: { select: { courseId: true, title: true } },
        },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.certificate.findMany({
        where: { organizationId, userId, deletedAt: null, status: 'issued' },
        select: {
          id: true,
          issuedAt: true,
          course: { select: { id: true, title: true } },
        },
      }),
    ]);

    const completedProgressRows = progressRows.filter((row) => row.status === 'completed' && row.completedAt);
    const startedCourseIds = [...new Set(progressRows.map((row) => row.courseId))];

    const totalLessonsByCourse = await this.prisma.lesson.groupBy({
      by: ['courseId'],
      where: { organizationId, courseId: { in: startedCourseIds }, status: 'published', deletedAt: null },
      _count: { _all: true },
    });
    const totalLessonsByCourseId = new Map(totalLessonsByCourse.map((row) => [row.courseId, row._count._all]));

    const completedLessonIdsByCourseId = new Map<string, Set<string>>();
    const latestActivityByCourseId = new Map<string, string>();
    for (const row of completedProgressRows) {
      const set = completedLessonIdsByCourseId.get(row.courseId) ?? new Set<string>();
      set.add(row.lessonId as string);
      completedLessonIdsByCourseId.set(row.courseId, set);

      const current = latestActivityByCourseId.get(row.courseId);
      const completedAtIso = row.completedAt!.toISOString();
      if (!current || completedAtIso > current) {
        latestActivityByCourseId.set(row.courseId, completedAtIso);
      }
    }

    const latestScoreByCourseId = new Map<string, number>();
    for (const attempt of attemptRows) {
      const courseId = attempt.assessment.courseId;
      if (!latestScoreByCourseId.has(courseId)) {
        latestScoreByCourseId.set(courseId, attempt.percentage);
      }
    }

    const courseTitleById = new Map(progressRows.map((row) => [row.courseId, row.course.title]));

    const courses = startedCourseIds
      .map((courseId) => {
        const totalLessons = totalLessonsByCourseId.get(courseId) ?? 0;
        const completedLessons = completedLessonIdsByCourseId.get(courseId)?.size ?? 0;
        const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

        return {
          courseId,
          title: courseTitleById.get(courseId) ?? '',
          completedLessons,
          totalLessons,
          percentage,
          status: totalLessons > 0 && completedLessons >= totalLessons ? ('completed' as const) : ('in_progress' as const),
          latestAssessmentScore: latestScoreByCourseId.get(courseId) ?? null,
        };
      })
      .sort((a, b) => (latestActivityByCourseId.get(b.courseId) ?? '').localeCompare(latestActivityByCourseId.get(a.courseId) ?? ''));

    const totalLessonsSum = [...totalLessonsByCourseId.values()].reduce((sum, count) => sum + count, 0);
    const totalCompletedSum = [...completedLessonIdsByCourseId.values()].reduce((sum, set) => sum + set.size, 0);
    const overallProgressPercent = totalLessonsSum > 0 ? Math.round((totalCompletedSum / totalLessonsSum) * 100) : 0;

    const lessonsInPeriod = completedProgressRows.filter((row) => row.completedAt! >= periodStart);
    const attemptsInPeriod = attemptRows.filter((attempt) => attempt.completedAt! >= periodStart);
    const certificatesInPeriod = certificateRows.filter((certificate) => certificate.issuedAt >= periodStart);

    const lessonsCompletedCount = lessonsInPeriod.length;
    const avgAssessmentScore =
      attemptsInPeriod.length > 0
        ? Math.round(attemptsInPeriod.reduce((sum, attempt) => sum + attempt.percentage, 0) / attemptsInPeriod.length)
        : null;

    const activeDays = new Set<string>();
    for (const row of lessonsInPeriod) {
      activeDays.add(dateKeyUtc(row.completedAt!));
    }
    for (const attempt of attemptsInPeriod) {
      activeDays.add(dateKeyUtc(attempt.completedAt!));
    }
    const activeDaysCount = activeDays.size;

    const lessonsThisWeek = completedProgressRows.filter((row) => row.completedAt! >= weekStart);
    const weeklyGoal = { completed: lessonsThisWeek.length, target: WEEKLY_GOAL_TARGET };

    const activeDaysThisWeek = new Set<string>();
    for (const row of completedProgressRows) {
      if (row.completedAt! >= weekStart) activeDaysThisWeek.add(dateKeyUtc(row.completedAt!));
    }
    for (const attempt of attemptRows) {
      if (attempt.completedAt! >= weekStart) activeDaysThisWeek.add(dateKeyUtc(attempt.completedAt!));
    }
    const streak = Array.from({ length: 7 }, (_, dayOfWeek) => {
      const date = new Date(weekStart.getTime() + dayOfWeek * MS_PER_DAY);
      return {
        dayOfWeek,
        date: dateKeyUtc(date),
        active: activeDaysThisWeek.has(dateKeyUtc(date)),
      };
    });

    const recentActivity = [
      ...lessonsInPeriod.map((row) => ({
        type: 'lesson_completed' as const,
        courseId: row.courseId,
        courseTitle: courseTitleById.get(row.courseId) ?? '',
        date: row.completedAt!.toISOString(),
      })),
      ...attemptsInPeriod.map((attempt) => ({
        type: 'assessment_passed' as const,
        courseId: attempt.assessment.courseId,
        courseTitle: courseTitleById.get(attempt.assessment.courseId) ?? '',
        score: attempt.percentage,
        date: attempt.completedAt!.toISOString(),
      })),
      ...certificatesInPeriod.map((certificate) => ({
        type: 'certificate_issued' as const,
        courseId: certificate.course.id,
        courseTitle: certificate.course.title,
        date: certificate.issuedAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5);

    return {
      period,
      overallProgressPercent,
      lessonsCompletedCount,
      activeDaysCount,
      avgAssessmentScore,
      courses,
      weeklyGoal,
      streak,
      recentActivity,
    };
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKLY_GOAL_TARGET = 3;

function startOfWeekUtc(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day;
}

function dateKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

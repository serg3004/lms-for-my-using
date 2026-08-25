import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';

// Bounds how many completed-progress rows are scanned to rank "continue learning"
// courses by most-recent completion. Generous enough for any real learner history
// while keeping the query a single bounded index scan.
const COMPLETED_PROGRESS_SCAN_LIMIT = 500;
const CONTINUE_LEARNING_COURSE_LIMIT = 3;
const UPCOMING_DEADLINES_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 5;

type LearnerDashboardActor = Pick<CurrentUser, 'id' | 'organizationId'>;

@Injectable()
export class LearnerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLearnerDashboard(actor: LearnerDashboardActor) {
    const where = { organizationId: actor.organizationId, userId: actor.id, deletedAt: null } as const;

    const [
      coursesCount,
      pendingAssignmentsCount,
      availableAssessmentsCount,
      certificatesCount,
      completedProgress,
      upcomingAssignments,
      recentCertificates,
      recentCompletedLessons,
    ] = await Promise.all([
      this.prisma.course.count({ where: { organizationId: actor.organizationId, deletedAt: null, status: 'published' } }),
      this.prisma.assignment.count({ where: { ...where, status: { not: 'completed' } } }),
      this.prisma.assessment.count({ where: { organizationId: actor.organizationId, deletedAt: null, status: 'published' } }),
      this.prisma.certificate.count({ where }),
      this.prisma.progress.findMany({
        where: { ...where, completedAt: { not: null } },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: COMPLETED_PROGRESS_SCAN_LIMIT,
        select: { courseId: true, lessonId: true, completedAt: true, course: { select: { id: true, title: true } } },
      }),
      this.prisma.assignment.findMany({
        where: { ...where, status: { not: 'completed' }, dueAt: { not: null } },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: UPCOMING_DEADLINES_LIMIT,
        select: { id: true, dueAt: true, course: { select: { id: true, title: true } } },
      }),
      this.prisma.certificate.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
        take: RECENT_ACTIVITY_LIMIT,
        select: { id: true, issuedAt: true, course: { select: { id: true, title: true } } },
      }),
      this.prisma.progress.findMany({
        where: { ...where, completedAt: { not: null } },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: RECENT_ACTIVITY_LIMIT,
        select: { id: true, completedAt: true, course: { select: { id: true, title: true } } },
      }),
    ]);

    const continueLearning = await this.buildContinueLearning(actor, completedProgress);

    const upcomingDeadlines = upcomingAssignments.map((assignment) => ({
      id: assignment.id,
      courseTitle: assignment.course?.title ?? null,
      dueAt: assignment.dueAt!.toISOString(),
    }));

    const recentActivity = [
      ...recentCompletedLessons.map((progress) => ({
        type: 'lesson_completed' as const,
        id: progress.id,
        date: progress.completedAt!.toISOString(),
        courseTitle: progress.course.title,
      })),
      ...recentCertificates.map((certificate) => ({
        type: 'certificate_issued' as const,
        id: certificate.id,
        date: certificate.issuedAt.toISOString(),
        courseTitle: certificate.course.title,
      })),
    ]
      .sort((left, right) => (left.date < right.date ? 1 : -1))
      .slice(0, RECENT_ACTIVITY_LIMIT);

    return {
      coursesCount,
      pendingAssignmentsCount,
      availableAssessmentsCount,
      certificatesCount,
      continueLearning,
      upcomingDeadlines,
      recentActivity,
    };
  }

  private async buildContinueLearning(
    actor: LearnerDashboardActor,
    completedProgress: Array<{
      courseId: string;
      lessonId: string | null;
      completedAt: Date | null;
      course: { id: string; title: string };
    }>,
  ) {
    const latestByCourseId = new Map<string, { title: string; completedAt: Date }>();
    const completedLessonsByCourseId = new Map<string, Set<string>>();

    for (const entry of completedProgress) {
      if (!entry.completedAt) continue;

      const current = latestByCourseId.get(entry.courseId);
      if (!current || entry.completedAt > current.completedAt) {
        latestByCourseId.set(entry.courseId, { title: entry.course.title, completedAt: entry.completedAt });
      }

      if (entry.lessonId) {
        const set = completedLessonsByCourseId.get(entry.courseId) ?? new Set<string>();
        set.add(entry.lessonId);
        completedLessonsByCourseId.set(entry.courseId, set);
      }
    }

    const topCourseIds = [...latestByCourseId.entries()]
      .sort((a, b) => (a[1].completedAt < b[1].completedAt ? 1 : -1))
      .slice(0, CONTINUE_LEARNING_COURSE_LIMIT)
      .map(([courseId]) => courseId);

    if (topCourseIds.length === 0) return [];

    const lessonCounts = await this.prisma.lesson.groupBy({
      by: ['courseId'],
      where: { organizationId: actor.organizationId, courseId: { in: topCourseIds }, deletedAt: null, status: 'published' },
      _count: { _all: true },
    });
    const totalLessonsByCourseId = new Map(lessonCounts.map((row) => [row.courseId, row._count._all]));

    return topCourseIds.map((courseId) => ({
      courseId,
      courseTitle: latestByCourseId.get(courseId)!.title,
      completedLessons: completedLessonsByCourseId.get(courseId)?.size ?? 0,
      totalLessons: totalLessonsByCourseId.get(courseId) ?? 0,
    }));
  }
}

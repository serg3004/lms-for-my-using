import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { CourseAccessPolicy } from '../course-access/public.js';
import type { CourseScopedUser } from '../course-access/public.js';
import { AssignCourseInstructorInput, CreateCourseInput, UpdateCourseInput, UpdateCourseStatusInput } from './courses.schemas.js';

const instructorSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const courseSelect = {
  id: true,
  organizationId: true,
  title: true,
  slug: true,
  description: true,
  category: true,
  durationMinutes: true,
  status: true,
  selfEnrollmentEnabled: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { lessons: true },
  },
} as const;

const completedProgressStatus = 'completed' as const;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessPolicy,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async listCourses(organizationId: string, page: number, pageSize: number, instructorId?: string, hideDrafts = false) {
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId,
      deletedAt: null,
      ...(instructorId ? { instructors: { some: { instructorId, organizationId, deletedAt: null } } } : {}),
      ...(hideDrafts ? { status: { not: 'draft' as const } } : {}),
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: courseSelect }),
      this.prisma.course.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async listCourseSummaries(organizationId: string, page: number, pageSize: number, instructorId?: string) {
    const result = await this.listCourses(organizationId, page, pageSize, instructorId);
    const courseIds = result.items.map((course) => course.id);
    if (courseIds.length === 0) return result;

    const [lessonCounts, learnerProgress] = await Promise.all([
      this.prisma.lesson.groupBy({
        by: ['courseId'],
        where: { organizationId, courseId: { in: courseIds }, deletedAt: null, status: 'published' },
        _count: { _all: true },
      }),
      this.prisma.progress.groupBy({
        by: ['courseId', 'userId', 'status'],
        where: {
          organizationId,
          courseId: { in: courseIds },
          deletedAt: null,
          lessonId: { not: null },
          lesson: { deletedAt: null, status: 'published' },
        },
        _count: { _all: true },
      }),
    ]);

    const lessonsByCourse = new Map(lessonCounts.map((row) => [row.courseId, row._count._all]));
    const learnersByCourse = new Map<string, Map<string, number>>();
    for (const row of learnerProgress) {
      const learners = learnersByCourse.get(row.courseId) ?? new Map<string, number>();
      if (!learners.has(row.userId)) learners.set(row.userId, 0);
      if (row.status === completedProgressStatus) learners.set(row.userId, (learners.get(row.userId) ?? 0) + row._count._all);
      learnersByCourse.set(row.courseId, learners);
    }

    return {
      ...result,
      items: result.items.map((course) => ({
        ...course,
        metrics: (() => {
          const learners = learnersByCourse.get(course.id) ?? new Map<string, number>();
          const totalLessons = lessonsByCourse.get(course.id) ?? 0;
          const completed = totalLessons > 0
            ? [...learners.values()].filter((completedLessons) => completedLessons >= totalLessons).length
            : 0;
          return { enrolled: learners.size, inProgress: learners.size - completed, completed };
        })(),
      })),
    };
  }

  async getCourse(courseId: string, organizationId: string, hideDrafts = false) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
        ...(hideDrafts ? { status: { not: 'draft' as const } } : {}),
      },
      select: courseSelect,
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  async getCourseCompletion(courseId: string, userId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({
        where: {
          courseId,
          organizationId,
          deletedAt: null,
          status: 'published',
        },
      }),
      this.prisma.progress.count({
        where: {
          courseId,
          userId,
          organizationId,
          deletedAt: null,
          status: completedProgressStatus,
          lessonId: { not: null },
          lesson: {
            status: 'published',
            deletedAt: null,
          },
        },
      }),
    ]);

    const isCompleted = totalLessons > 0 && completedLessons >= totalLessons;
    const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    return {
      courseId,
      userId,
      organizationId,
      totalLessons,
      completedLessons,
      isCompleted,
      percentage,
    };
  }

  async createCourse(input: CreateCourseInput, user: CourseScopedUser) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingCourse = await this.prisma.course.findUnique({
      where: {
        organizationId_slug: {
          organizationId: input.organizationId,
          slug: input.slug,
        },
      },
      select: { id: true },
    });

    if (existingCourse) {
      throw new ConflictException('Course slug already exists in organization');
    }

    // Course creation and instructor ownership assignment must succeed or fail together —
    // otherwise a failed assignInstructor leaves an orphaned course the creator can't see
    // (CourseAccessGuard filters instructors by CourseInstructor rows).
    const course = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: input,
        select: courseSelect,
      });

      await this.courseAccess.assignInstructor(course.id, user, tx);

      return course;
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId: user.id,
      action: 'course.created',
      targetType: 'course',
      targetId: course.id,
      summary: `Created course ${course.title}`,
    });

    return course;
  }

  async updateCourse(courseId: string, organizationId: string, input: UpdateCourseInput, actorId: string | null = null) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, slug: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (input.slug && input.slug !== course.slug) {
      const existingCourse = await this.prisma.course.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: input.slug,
          },
        },
        select: { id: true },
      });

      if (existingCourse) {
        throw new ConflictException('Course slug already exists in organization');
      }
    }

    const updated = await this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: input,
      select: courseSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'course.updated',
      targetType: 'course',
      targetId: courseId,
      summary: `Updated course ${updated.title}`,
      metadata: { fields: Object.keys(input) },
    });

    return updated;
  }

  async updateCourseStatus(courseId: string, organizationId: string, status: UpdateCourseStatusInput['status'], actorId: string | null = null) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const updated = await this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: { status },
      select: courseSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'course.updated',
      targetType: 'course',
      targetId: courseId,
      summary: `Set course ${updated.title} status to ${status}`,
      metadata: { status },
    });

    return updated;
  }

  async deleteCourse(courseId: string, organizationId: string, actorId: string | null = null) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
      select: { id: true, slug: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: { deletedAt: new Date(), slug: releaseSlugOnDelete(course.slug, course.id) },
      select: { id: true },
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'course.deleted',
      targetType: 'course',
      targetId: courseId,
      summary: `Deleted course ${course.slug}`,
    });
  }

  async listInstructors(courseId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    return this.fetchInstructors(courseId, organizationId);
  }

  async addInstructor(courseId: string, organizationId: string, input: AssignCourseInstructorInput) {
    await this.ensureCourseExists(courseId, organizationId);

    const instructor = await this.prisma.user.findFirst({
      where: {
        id: input.instructorId,
        organizationId,
        deletedAt: null,
        memberships: {
          some: {
            organizationId,
            role: 'instructor',
          },
        },
      },
      select: { id: true },
    });

    if (!instructor) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.courseInstructor.upsert({
      where: { courseId_instructorId: { courseId, instructorId: input.instructorId } },
      create: { courseId, instructorId: input.instructorId, organizationId },
      update: { deletedAt: null },
    });

    return this.fetchInstructors(courseId, organizationId);
  }

  async removeInstructor(courseId: string, organizationId: string, instructorId: string) {
    const assignment = await this.prisma.courseInstructor.findFirst({
      where: { courseId, instructorId, organizationId, deletedAt: null },
      select: { courseId: true, instructorId: true },
    });

    if (!assignment) {
      throw new NotFoundException('Course instructor not found');
    }

    await this.prisma.courseInstructor.update({
      where: { courseId_instructorId: { courseId, instructorId } },
      data: { deletedAt: new Date() },
    });

    return this.fetchInstructors(courseId, organizationId);
  }

  private async fetchInstructors(courseId: string, organizationId: string) {
    const instructors = await this.prisma.courseInstructor.findMany({
      where: { courseId, organizationId, deletedAt: null },
      orderBy: { assignedAt: 'asc' },
      select: { instructor: { select: instructorSummarySelect } },
    });

    return instructors.map((entry) => entry.instructor);
  }

  private async ensureCourseExists(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }
}

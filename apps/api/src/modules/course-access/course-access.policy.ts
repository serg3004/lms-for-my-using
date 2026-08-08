import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CurrentUser } from '../auth/auth.schemas.js';

export type CourseScopedUser = Pick<CurrentUser, 'id' | 'organizationId' | 'roles'>;
export type CourseResource = 'lesson' | 'material' | 'assessment' | 'question' | 'assignment' | 'progress' | 'attempt' | 'certificate';

/** Central policy for instructor ownership of course-bound resources. */
@Injectable()
export class CourseAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  isInstructorScoped(user: CourseScopedUser): boolean {
    return isInstructorCourseScoped(user);
  }

  courseWhere(user: CourseScopedUser) {
    return {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(this.isInstructorScoped(user)
        ? { instructors: { some: { instructorId: user.id, organizationId: user.organizationId, deletedAt: null } } }
        : {}),
    } as const;
  }

  async assertCourseAccess(courseId: string, user: CourseScopedUser): Promise<void> {
    if (!this.isInstructorScoped(user)) return;

    const course = await this.prisma.course.findFirst({
      where: { id: courseId, ...this.courseWhere(user) },
      select: { id: true },
    });

    if (!course) throw new NotFoundException('Course not found');
  }

  /**
   * Single-query ownership check: filters the resource directly through its course relation
   * (nested `course`/`assessment.course`) instead of a separate follow-up query to `course`.
   */
  async assertResourceAccess(resource: CourseResource, resourceId: string, user: CourseScopedUser): Promise<void> {
    if (!this.isInstructorScoped(user)) return;

    const where = { id: resourceId, organizationId: user.organizationId, deletedAt: null };
    const course = this.courseWhere(user);
    let record: { id: string } | null;
    switch (resource) {
      case 'lesson': record = await this.prisma.lesson.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'material': record = await this.prisma.courseMaterial.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'assessment': record = await this.prisma.assessment.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'assignment': record = await this.prisma.assignment.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'progress': record = await this.prisma.progress.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'attempt':
        record = await this.prisma.assessmentAttempt.findFirst({ where: { ...where, assessment: { course } }, select: { id: true } });
        break;
      case 'certificate': record = await this.prisma.certificate.findFirst({ where: { ...where, course }, select: { id: true } }); break;
      case 'question':
        record = await this.prisma.assessmentQuestion.findFirst({ where: { ...where, assessment: { course } }, select: { id: true } });
        break;
    }
    if (!record) throw new NotFoundException('Course resource not found');
  }

  async assignInstructor(
    courseId: string,
    user: CourseScopedUser,
    client: Pick<PrismaService, 'courseInstructor'> = this.prisma,
  ): Promise<void> {
    if (!this.isInstructorScoped(user)) return;

    await client.courseInstructor.upsert({
      where: { courseId_instructorId: { courseId, instructorId: user.id } },
      create: { courseId, instructorId: user.id, organizationId: user.organizationId },
      update: { deletedAt: null },
    });
  }
}
export function isInstructorCourseScoped(user: CourseScopedUser): boolean {
  return user.roles.includes('instructor') && !user.roles.includes('admin');
}

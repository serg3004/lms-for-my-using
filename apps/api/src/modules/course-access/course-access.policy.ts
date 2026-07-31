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
        ? { instructors: { some: { instructorId: user.id, organizationId: user.organizationId } } }
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

  async assertResourceAccess(resource: CourseResource, resourceId: string, user: CourseScopedUser): Promise<void> {
    if (!this.isInstructorScoped(user)) return;

    const where = { id: resourceId, organizationId: user.organizationId, deletedAt: null };
    let record: { courseId: string } | null;
    switch (resource) {
      case 'lesson': record = await this.prisma.lesson.findFirst({ where, select: { courseId: true } }); break;
      case 'material': record = await this.prisma.courseMaterial.findFirst({ where, select: { courseId: true } }); break;
      case 'assessment': record = await this.prisma.assessment.findFirst({ where, select: { courseId: true } }); break;
      case 'assignment': record = await this.prisma.assignment.findFirst({ where, select: { courseId: true } }); break;
      case 'progress': record = await this.prisma.progress.findFirst({ where, select: { courseId: true } }); break;
      case 'attempt': {
        const attempt = await this.prisma.assessmentAttempt.findFirst({
          where,
          select: { assessment: { select: { courseId: true } } },
        });
        record = attempt ? { courseId: attempt.assessment.courseId } : null;
        break;
      }
      case 'certificate': record = await this.prisma.certificate.findFirst({ where, select: { courseId: true } }); break;
      case 'question': {
        const question = await this.prisma.assessmentQuestion.findFirst({
          where,
          select: { assessment: { select: { courseId: true } } },
        });
        record = question ? { courseId: question.assessment.courseId } : null;
        break;
      }
    }
    if (!record) throw new NotFoundException('Course resource not found');
    await this.assertCourseAccess(record.courseId, user);
  }

  async assignInstructor(courseId: string, user: CourseScopedUser): Promise<void> {
    if (!this.isInstructorScoped(user)) return;

    await this.prisma.courseInstructor.create({
      data: { courseId, instructorId: user.id, organizationId: user.organizationId },
    });
  }
}
export function isInstructorCourseScoped(user: CourseScopedUser): boolean {
  return user.roles.includes('instructor') && !user.roles.includes('admin');
}

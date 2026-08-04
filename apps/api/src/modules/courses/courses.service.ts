import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateCourseInput, UpdateCourseInput, UpdateCourseStatusInput } from './courses.schemas.js';

const courseSelect = {
  id: true,
  organizationId: true,
  title: true,
  slug: true,
  description: true,
  category: true,
  durationMinutes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { lessons: true },
  },
} as const;

const completedProgressStatus = 'completed' as const;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourses(organizationId: string, page: number, pageSize: number, instructorId?: string) {
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId,
      deletedAt: null,
      ...(instructorId ? { instructors: { some: { instructorId, organizationId } } } : {}),
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: courseSelect }),
      this.prisma.course.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getCourse(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
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

  async createCourse(input: CreateCourseInput) {
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

    return this.prisma.course.create({
      data: input,
      select: courseSelect,
    });
  }

  async updateCourse(courseId: string, organizationId: string, input: UpdateCourseInput) {
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

    return this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: input,
      select: courseSelect,
    });
  }

  async updateCourseStatus(courseId: string, organizationId: string, status: UpdateCourseStatusInput['status']) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: { status },
      select: courseSelect,
    });
  }

  async deleteCourse(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    await this.prisma.course.update({
      where: { id: courseId, organizationId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
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

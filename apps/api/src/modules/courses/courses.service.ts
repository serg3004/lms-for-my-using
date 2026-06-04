import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateCourseInput, UpdateCourseStatusInput } from './courses.schemas.js';

const courseSelect = {
  id: true,
  organizationId: true,
  title: true,
  slug: true,
  description: true,
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

  async listCourses(organizationId: string) {
    return this.prisma.course.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: courseSelect,
    });
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

  async updateCourseStatus(courseId: string, organizationId: string, status: UpdateCourseStatusInput['status']) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.prisma.course.update({
      where: { id: courseId },
      data: { status },
      select: courseSelect,
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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateLessonInput } from './lessons.schemas.js';

const lessonSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  title: true,
  slug: true,
  description: true,
  order: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLessons(courseId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    return this.prisma.lesson.findMany({
      where: {
        courseId,
        organizationId,
        deletedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      select: lessonSelect,
    });
  }

  async getLesson(lessonId: string, organizationId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        organizationId,
        deletedAt: null,
      },
      select: lessonSelect,
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  async createLesson(input: CreateLessonInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    const existingLesson = await this.prisma.lesson.findUnique({
      where: {
        courseId_slug: {
          courseId: input.courseId,
          slug: input.slug,
        },
      },
      select: { id: true },
    });

    if (existingLesson) {
      throw new ConflictException('Lesson slug already exists in course');
    }

    return this.prisma.lesson.create({
      data: input,
      select: lessonSelect,
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

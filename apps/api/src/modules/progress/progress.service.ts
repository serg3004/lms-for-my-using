import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
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
} as const;

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async listProgress(organizationId: string) {
    return this.prisma.progress.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: progressSelect,
    });
  }

  async getProgress(progressId: string, organizationId: string) {
    const progress = await this.prisma.progress.findFirst({
      where: {
        id: progressId,
        organizationId,
        deletedAt: null,
      },
      select: progressSelect,
    });

    if (!progress) {
      throw new NotFoundException('Progress not found');
    }

    return progress;
  }

  async createProgress(input: CreateProgressInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);
    await this.ensureUserExists(input.userId, input.organizationId);

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
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
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
}

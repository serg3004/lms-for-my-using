import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateAssessmentInput } from './assessments.schemas.js';

const assessmentSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  passingScore: true,
  maxAttempts: true,
  availableAfterCourseCompletion: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssessments(organizationId: string) {
    return this.prisma.assessment.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: assessmentSelect,
    });
  }

  async getAssessment(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        deletedAt: null,
      },
      select: assessmentSelect,
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  async createAssessment(input: CreateAssessmentInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.lessonId) {
      await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, input.organizationId);
    }

    return this.prisma.assessment.create({
      data: input,
      select: assessmentSelect,
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

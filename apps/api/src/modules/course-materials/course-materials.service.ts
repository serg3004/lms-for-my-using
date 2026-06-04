import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateCourseMaterialInput,
  UpdateCourseMaterialInput,
  UpdateCourseMaterialStatusInput,
} from './course-materials.schemas.js';

const courseMaterialSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  title: true,
  slug: true,
  description: true,
  kind: true,
  fileName: true,
  fileUrl: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CourseMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourseMaterials(courseId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    return this.prisma.courseMaterial.findMany({
      where: {
        courseId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: courseMaterialSelect,
    });
  }

  async getCourseMaterial(materialId: string, organizationId: string) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: {
        id: materialId,
        organizationId,
        deletedAt: null,
      },
      select: courseMaterialSelect,
    });

    if (!material) {
      throw new NotFoundException('Course material not found');
    }

    return material;
  }

  async createCourseMaterial(input: CreateCourseMaterialInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.lessonId) {
      await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, input.organizationId);
    }

    const existingMaterial = await this.prisma.courseMaterial.findUnique({
      where: {
        courseId_slug: {
          courseId: input.courseId,
          slug: input.slug,
        },
      },
      select: { id: true },
    });

    if (existingMaterial) {
      throw new ConflictException('Course material slug already exists in course');
    }

    return this.prisma.courseMaterial.create({
      data: input,
      select: courseMaterialSelect,
    });
  }

  async updateCourseMaterialStatus(
    materialId: string,
    organizationId: string,
    status: UpdateCourseMaterialStatusInput['status'],
  ) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!material) {
      throw new NotFoundException('Course material not found');
    }

    return this.prisma.courseMaterial.update({
      where: { id: materialId },
      data: { status },
      select: courseMaterialSelect,
    });
  }

  async updateCourseMaterial(materialId: string, organizationId: string, input: UpdateCourseMaterialInput) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!material) {
      throw new NotFoundException('Course material not found');
    }

    return this.prisma.courseMaterial.update({
      where: { id: materialId },
      data: input,
      select: courseMaterialSelect,
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

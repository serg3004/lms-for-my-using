import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
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
  objectKey: true,
  quarantineKey: true,
  mimeType: true,
  sizeBytes: true,
  scanStatus: true,
  scanReason: true,
  scanExpiresAt: true,
  scannedAt: true,
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
      where: { id: materialId, organizationId },
      data: { status },
      select: courseMaterialSelect,
    });
  }

  async updateCourseMaterial(materialId: string, organizationId: string, input: UpdateCourseMaterialInput) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, deletedAt: null },
      select: { id: true, courseId: true },
    });

    if (!material) {
      throw new NotFoundException('Course material not found');
    }

    if (input.lessonId) {
      await this.ensureLessonBelongsToCourse(input.lessonId, material.courseId, organizationId);
    }

    return this.prisma.courseMaterial.update({
      where: { id: materialId, organizationId },
      data: input,
      select: courseMaterialSelect,
    });
  }

  /** Soft-deletes the material record. Any attached file/quarantine object is purged first via clearUploadedFile. */
  async deleteCourseMaterial(materialId: string, organizationId: string) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, deletedAt: null },
      select: { id: true, slug: true },
    });

    if (!material) {
      throw new NotFoundException('Course material not found');
    }

    await this.prisma.courseMaterial.update({
      where: { id: materialId, organizationId },
      data: { deletedAt: new Date(), slug: releaseSlugOnDelete(material.slug, material.id) },
      select: { id: true },
    });
  }

  async getMaterialStorageReference(materialId: string, organizationId: string) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true, kind: true, fileUrl: true, fileName: true, objectKey: true, quarantineKey: true, scanStatus: true, scanExpiresAt: true, status: true },
    });
    if (!material) throw new NotFoundException('Course material not found');
    return material;
  }

  async attachUploadedFile(
    materialId: string,
    organizationId: string,
    file: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number },
  ) {
    await this.getMaterialStorageReference(materialId, organizationId);
    return this.prisma.courseMaterial.update({
      where: { id: materialId, organizationId },
      data: {
        quarantineKey: file.objectKey,
        objectKey: null,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        kind: 'file',
        fileUrl: null,
        scanStatus: 'pending',
        scanReason: null,
        scanExpiresAt: new Date(Date.now() + 15 * 60_000),
        scannedAt: null,
      },
      select: courseMaterialSelect,
    });
  }

  async clearUploadedFile(materialId: string, organizationId: string, actorId: string) {
    const material = await this.getMaterialStorageReference(materialId, organizationId);
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.courseMaterial.update({
        where: { id: materialId, organizationId },
        data: { objectKey: null, quarantineKey: null, fileName: null, mimeType: null, sizeBytes: null, scanStatus: null, scanReason: null, scanExpiresAt: null, scannedAt: null },
        select: courseMaterialSelect,
      });
      await transaction.materialFileDeletionAudit.create({
        data: {
          organizationId,
          materialId,
          actorId,
          objectKeys: [material.objectKey, material.quarantineKey].filter((key): key is string => Boolean(key)),
          result: material.objectKey || material.quarantineKey ? 'deleted' : 'already_absent',
        },
      });
      return updated;
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

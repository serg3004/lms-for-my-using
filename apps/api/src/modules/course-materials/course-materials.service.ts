import { randomBytes } from 'node:crypto';

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { assertLibraryFolder } from '../../common/library-folder-check.js';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
import {
  CreateCourseMaterialInput,
  CreateLibraryMaterialInput,
  UpdateCourseMaterialInput,
  UpdateCourseMaterialStatusInput,
} from './course-materials.schemas.js';

const courseMaterialSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  folderId: true,
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

const LIBRARY_LIST_LIMIT = 500;

function slugOf(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug.length >= 3 ? slug : 'material';
}

@Injectable()
export class CourseMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureStandaloneMaterial(materialId: string) {
    const managed = await this.prisma.courseMaterial.findFirst({ where: { id: materialId, longreadDocumentId: { not: null } }, select: { id: true } });
    if (managed) throw new NotFoundException('Course material not found');
  }

  async listCourseMaterials(courseId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    const rows = await this.prisma.courseMaterial.findMany({
      where: {
        OR: [{ courseId }, { links: { some: { courseId } } }],
        organizationId,
        longreadDocumentId: null,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: LEGACY_LIST_LIMIT,
      select: { ...courseMaterialSelect, links: { where: { courseId }, select: { lessonId: true } } },
    });
    // PR 582: a material connected from the library takes the lesson of its connection to this course.
    return rows.map(({ links, ...material }) => (material.courseId === courseId ? { ...material, connected: false } : { ...material, lessonId: links[0]?.lessonId ?? null, connected: true }));
  }

  /** PR 582: the library of the organization: every standalone material with the places it is used in. */
  async listLibrary(organizationId: string, folderId: string | null | undefined) {
    const rows = await this.prisma.courseMaterial.findMany({
      where: { organizationId, longreadDocumentId: null, deletedAt: null, ...(folderId === undefined ? {} : { folderId }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: LIBRARY_LIST_LIMIT,
      select: { ...courseMaterialSelect, course: { select: { title: true } }, links: { select: { courseId: true, lessonId: true, course: { select: { title: true } } } } },
    });
    return rows.map(({ course, links, ...material }) => ({
      ...material,
      usedIn: [
        ...(material.courseId && course ? [{ courseId: material.courseId, courseTitle: course.title }] : []),
        ...links.map((link) => ({ courseId: link.courseId, courseTitle: link.course.title })),
      ],
    }));
  }

  /** PR 582: a material that belongs to no course. Only an administrator creates it. */
  async createLibraryMaterial(organizationId: string, roles: readonly string[], input: CreateLibraryMaterialInput) {
    if (!roles.includes('admin')) throw new ForbiddenException('Not allowed');
    await assertLibraryFolder(this.prisma, organizationId, 'material', input.folderId);
    return this.prisma.courseMaterial.create({
      data: { ...input, organizationId, slug: input.slug ?? `${slugOf(input.title)}-${randomBytes(3).toString('hex')}` },
      select: courseMaterialSelect,
    });
  }

  /** Where a material is used: its own course and every connection. Used to warn before it is deleted. */
  async materialUsage(materialId: string, organizationId: string) {
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, longreadDocumentId: null, deletedAt: null },
      select: { id: true, course: { select: { id: true, title: true } }, links: { select: { course: { select: { id: true, title: true } }, lesson: { select: { id: true, title: true } } } } },
    });
    if (!material) throw new NotFoundException('Course material not found');
    return {
      places: [
        ...(material.course ? [{ courseId: material.course.id, courseTitle: material.course.title, lessonId: null, lessonTitle: null, own: true }] : []),
        ...material.links.map((link) => ({ courseId: link.course.id, courseTitle: link.course.title, lessonId: link.lesson?.id ?? null, lessonTitle: link.lesson?.title ?? null, own: false })),
      ],
    };
  }

  /** PR 582: connects a library material to a course (and a lesson of it). A second call changes the lesson. */
  async connectMaterial(courseId: string, organizationId: string, actor: { id: string; roles: readonly string[] }, materialId: string, lessonId: string | null) {
    await this.ensureCourseExists(courseId, organizationId);
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, organizationId, longreadDocumentId: null, deletedAt: null },
      select: { id: true, courseId: true },
    });
    if (!material) throw new NotFoundException('Course material not found');
    if (material.courseId === courseId) throw new ConflictException('Material already belongs to this course');
    // An instructor connects only library materials; a material of another course stays with that course.
    if (material.courseId !== null && !actor.roles.includes('admin')) throw new ForbiddenException('Not allowed');
    if (lessonId) await this.ensureLessonBelongsToCourse(lessonId, courseId, organizationId);
    await this.prisma.courseMaterialLink.upsert({
      where: { materialId_courseId: { materialId, courseId } },
      create: { organizationId, materialId, courseId, lessonId, createdBy: actor.id },
      update: { lessonId },
    });
    return { materialId, courseId, lessonId };
  }

  /** Disconnecting removes the place only; the material stays in the library. */
  async disconnectMaterial(courseId: string, organizationId: string, materialId: string) {
    await this.ensureCourseExists(courseId, organizationId);
    const removed = await this.prisma.courseMaterialLink.deleteMany({ where: { organizationId, courseId, materialId } });
    if (removed.count === 0) throw new NotFoundException('Material is not connected to this course');
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
      // A library material has no course of its own: its lesson is chosen on the connection.
      if (!material.courseId) throw new BadRequestException('A library material has no lesson');
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

    await this.prisma.$transaction([
      this.prisma.courseMaterialLink.deleteMany({ where: { materialId, organizationId } }),
      this.prisma.courseMaterial.update({
        where: { id: materialId, organizationId },
        data: { deletedAt: new Date(), slug: releaseSlugOnDelete(material.slug, material.id) },
        select: { id: true },
      }),
    ]);
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

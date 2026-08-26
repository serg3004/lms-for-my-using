import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { CreateLessonInput, UpdateLessonInput, UpdateLessonStatusInput } from './lessons.schemas.js';

const lessonSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  title: true,
  slug: true,
  description: true,
  type: true,
  order: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const lessonWithCourseSelect = {
  ...lessonSelect,
  course: { select: { title: true } },
} as const;

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

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

  async listAllLessons(organizationId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const where = { organizationId, deletedAt: null } as const;
    const [items, total] = await Promise.all([
      this.prisma.lesson.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: lessonWithCourseSelect }),
      this.prisma.lesson.count({ where }),
    ]);
    return { items, page, pageSize, total };
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

  async createLesson(input: CreateLessonInput, actorId: string | null = null) {
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

    const created = await this.prisma.lesson.create({
      data: input,
      select: lessonSelect,
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId,
      action: 'lesson.created',
      targetType: 'lesson',
      targetId: created.id,
      summary: `Created lesson ${created.title}`,
      metadata: { courseId: input.courseId },
    });

    return created;
  }

  async updateLessonStatus(lessonId: string, organizationId: string, status: UpdateLessonStatusInput['status'], actorId: string | null = null) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId, organizationId },
      data: { status },
      select: lessonSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'lesson.updated',
      targetType: 'lesson',
      targetId: lessonId,
      summary: `Set lesson ${updated.title} status to ${status}`,
      metadata: { status },
    });

    return updated;
  }

  async updateLesson(lessonId: string, organizationId: string, input: UpdateLessonInput, actorId: string | null = null) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId, organizationId },
      data: input,
      select: lessonSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'lesson.updated',
      targetType: 'lesson',
      targetId: lessonId,
      summary: `Updated lesson ${updated.title}`,
      metadata: { fields: Object.keys(input) },
    });

    return updated;
  }

  async reorderLessons(courseId: string, organizationId: string, lessonIds: string[]) {
    await this.ensureCourseExists(courseId, organizationId);

    const lessons = await this.prisma.lesson.findMany({
      where: {
        courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const existingIds = new Set(lessons.map((lesson) => lesson.id));

    if (lessonIds.length !== existingIds.size || lessonIds.some((lessonId) => !existingIds.has(lessonId))) {
      throw new BadRequestException('Lesson order must include every active course lesson exactly once');
    }

    const seenIds = new Set<string>();
    for (const lessonId of lessonIds) {
      if (seenIds.has(lessonId)) {
        throw new BadRequestException('Lesson order contains duplicate lesson ids');
      }

      seenIds.add(lessonId);
    }

    await this.prisma.$transaction(
      lessonIds.map((lessonId, order) =>
        this.prisma.lesson.update({
          where: { id: lessonId, organizationId },
          data: { order },
          select: { id: true },
        }),
      ),
    );

    return this.listLessons(courseId, organizationId);
  }

  async deleteLesson(lessonId: string, organizationId: string, actorId: string | null = null) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, organizationId, deletedAt: null },
      select: { id: true, slug: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    await this.prisma.lesson.update({
      where: { id: lessonId, organizationId },
      data: { deletedAt: new Date(), slug: releaseSlugOnDelete(lesson.slug, lesson.id) },
      select: { id: true },
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'lesson.deleted',
      targetType: 'lesson',
      targetId: lessonId,
      summary: `Deleted lesson ${lesson.slug}`,
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

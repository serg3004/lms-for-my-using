import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { LongreadsService } from '../longreads/public.js';
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
  private readonly longreads: LongreadsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    longreads?: LongreadsService,
  ) {
    this.longreads = longreads ?? new LongreadsService(prisma, auditLog);
  }

  /** Longread lessons are invisible (and cannot be created) while the organization has the feature off. */
  private async hiddenTypes(organizationId: string): Promise<{ type?: { not: 'longread' } }> {
    return (await this.longreads.isEnabled(organizationId)) ? {} : { type: { not: 'longread' } };
  }

  async listLessons(courseId: string, organizationId: string) {
    await this.ensureCourseExists(courseId, organizationId);

    return this.prisma.lesson.findMany({
      where: {
        courseId,
        organizationId,
        deletedAt: null,
        ...(await this.hiddenTypes(organizationId)),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      select: lessonSelect,
    });
  }

  async listAllLessons(organizationId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const where = { organizationId, deletedAt: null, ...(await this.hiddenTypes(organizationId)) };
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
        ...(await this.hiddenTypes(organizationId)),
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

    if (input.type === 'longread') {
      await this.longreads.ensureEnabled(input.organizationId);
      if (input.status !== 'draft') throw new BadRequestException('A longread is published with its own publish action');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({ data: input, select: lessonSelect });
      if (input.type === 'longread') await this.longreads.createForLesson(tx, input.organizationId, lesson.id);
      return lesson;
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
      select: { id: true, type: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    // A longread goes live only through the publish action, which cuts the immutable version learners read.
    if (lesson.type === 'longread' && status === 'published') {
      const published = await this.prisma.longreadDocument.findFirst({ where: { lessonId, organizationId, publishedRevisionId: { not: null } }, select: { id: true } });
      if (!published) throw new BadRequestException('Publish the longread with its publish action first');
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
      select: { id: true, type: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    // A longread owns a document; switching to or from that type would orphan or invent content.
    if (input.type !== undefined && input.type !== lesson.type && (input.type === 'longread' || lesson.type === 'longread')) {
      throw new BadRequestException('The longread lesson type cannot be changed');
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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { CreatePositionCourseInput, ListPositionCoursesQuery, UpdatePositionCourseInput } from './position-courses.schemas.js';

const positionCourseSelect = {
  id: true,
  organizationId: true,
  positionId: true,
  courseId: true,
  requirement: true,
  dueDays: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function rethrowAsConflictOnDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('This course already has a requirement entry for this position');
  }
  throw error;
}

@Injectable()
export class PositionCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async listPositionCourses(organizationId: string, query: ListPositionCoursesQuery) {
    const { positionId, courseId, status } = query;
    return this.prisma.positionCourse.findMany({
      where: {
        organizationId,
        ...(positionId ? { positionId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: positionCourseSelect,
    });
  }

  async getPositionCourse(id: string, organizationId: string) {
    const positionCourse = await this.prisma.positionCourse.findFirst({ where: { id, organizationId }, select: positionCourseSelect });
    if (!positionCourse) throw new NotFoundException('Position course requirement not found');
    return positionCourse;
  }

  async createPositionCourse(input: CreatePositionCourseInput, actorId: string | null) {
    await this.ensurePositionExists(input.positionId, input.organizationId);
    await this.ensureCourseExists(input.courseId, input.organizationId);

    const created = await this.prisma.positionCourse
      .create({
        data: {
          organizationId: input.organizationId,
          positionId: input.positionId,
          courseId: input.courseId,
          requirement: input.requirement,
          dueDays: input.dueDays ?? null,
        },
        select: positionCourseSelect,
      })
      .catch(rethrowAsConflictOnDuplicate);

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId,
      action: 'position_course.created',
      targetType: 'position_course',
      targetId: created.id,
      summary: 'Created position course requirement',
      metadata: { positionId: input.positionId, courseId: input.courseId, requirement: input.requirement },
    });

    return created;
  }

  async updatePositionCourse(id: string, organizationId: string, input: UpdatePositionCourseInput, actorId: string | null) {
    const existing = await this.prisma.positionCourse.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Position course requirement not found');

    const updated = await this.prisma.positionCourse.update({
      where: { id },
      data: {
        ...(input.requirement !== undefined ? { requirement: input.requirement } : {}),
        ...(input.dueDays !== undefined ? { dueDays: input.dueDays } : {}),
      },
      select: positionCourseSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'position_course.updated',
      targetType: 'position_course',
      targetId: id,
      summary: 'Updated position course requirement',
      metadata: { fields: Object.keys(input) },
    });

    return updated;
  }

  async archivePositionCourse(id: string, organizationId: string, actorId: string | null) {
    const existing = await this.prisma.positionCourse.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('Position course requirement not found');
    if (existing.status === 'archived') throw new ConflictException('Position course requirement is already archived');

    const updated = await this.prisma.positionCourse.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
      select: positionCourseSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'position_course.archived',
      targetType: 'position_course',
      targetId: id,
      summary: 'Archived position course requirement',
    });

    return updated;
  }

  async restorePositionCourse(id: string, organizationId: string, actorId: string | null) {
    const existing = await this.prisma.positionCourse.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('Position course requirement not found');
    if (existing.status !== 'archived') throw new ConflictException('Position course requirement is not archived');

    const updated = await this.prisma.positionCourse.update({
      where: { id },
      data: { status: 'active', archivedAt: null },
      select: positionCourseSelect,
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'position_course.restored',
      targetType: 'position_course',
      targetId: id,
      summary: 'Restored position course requirement',
    });

    return updated;
  }

  private async ensurePositionExists(positionId: string, organizationId: string) {
    const position = await this.prisma.position.findFirst({ where: { id: positionId, organizationId }, select: { id: true } });
    if (!position) throw new NotFoundException('Position not found');
  }

  private async ensureCourseExists(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, organizationId, deletedAt: null }, select: { id: true } });
    if (!course) throw new NotFoundException('Course not found');
  }
}

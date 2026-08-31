import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { ManagerTeamScope, normalizeActor, unrestrictedActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { CreateAssignmentInput, UpdateAssignmentStatusInput } from './assignments.schemas.js';

const assignmentSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  userId: true,
  groupId: true,
  departmentId: true,
  includeDescendants: true,
  status: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { title: true } },
} as const;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
  ) {}

  async listAssignments(actorInput: TeamScopeActor | string, userId: string | undefined, page: number, pageSize: number, instructorId?: string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId,
      ...(userId !== undefined ? { userId } : {}),
      ...(instructorId ? { course: { instructors: { some: { instructorId, organizationId, deletedAt: null } } } } : {}),
      ...this.teamScope.assignment(actor),
      deletedAt: null,
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.assignment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: assignmentSelect }),
      this.prisma.assignment.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getAssignment(assignmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        organizationId: actor.organizationId,
        ...this.teamScope.assignment(actor),
        deletedAt: null,
      },
      select: assignmentSelect,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async createAssignment(input: CreateAssignmentInput, actor: TeamScopeActor = unrestrictedActor(input.organizationId)) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.userId) {
      await this.ensureUserExists(input.userId, input.organizationId, actor);
    }

    if (input.groupId) {
      await this.ensureGroupExists(input.groupId, input.organizationId, actor);
    }

    if (input.departmentId) {
      await this.ensureDepartmentExists(input.departmentId, input.organizationId);
    }

    const created = await this.prisma.assignment.create({
      data: input,
      select: assignmentSelect,
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId: actor.id || null,
      action: 'assignment.created',
      targetType: 'assignment',
      targetId: created.id,
      summary: 'Created assignment',
      metadata: {
        courseId: input.courseId,
        userId: input.userId ?? null,
        groupId: input.groupId ?? null,
        departmentId: input.departmentId ?? null,
        includeDescendants: input.includeDescendants,
      },
    });

    return created;
  }

  async updateAssignmentStatus(
    assignmentId: string,
    actorInput: TeamScopeActor | string,
    status: UpdateAssignmentStatusInput['status'],
  ) {
    const actor = normalizeActor(actorInput);
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, organizationId: actor.organizationId, ...this.teamScope.assignment(actor), deletedAt: null },
      select: { id: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return this.prisma.assignment.update({
      where: { id: assignmentId, organizationId: actor.organizationId },
      data: { status },
      select: assignmentSelect,
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

  private async ensureUserExists(userId: string, organizationId: string, actor: TeamScopeActor) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        ...this.teamScope.user(actor),
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureGroupExists(groupId: string, organizationId: string, actor: TeamScopeActor) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        organizationId,
        ...this.teamScope.group(actor),
        deletedAt: null,
      },
      select: { id: true, status: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.status === 'archived') {
      throw new ConflictException('Cannot assign a course to an archived group');
    }
  }

  // No manager team-scope filter here (unlike ensureUserExists/ensureGroupExists) -- department
  // manager object-scope for assignment creation is deliberately out of scope for PR 277 and
  // belongs to PR 278's OrganizationAccessScopeService.
  private async ensureDepartmentExists(departmentId: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, organizationId },
      select: { id: true, status: true },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department.status === 'archived') {
      throw new ConflictException('Cannot assign a course to an archived department');
    }
  }
}

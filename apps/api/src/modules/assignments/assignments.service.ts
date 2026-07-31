import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope, TeamScopeActor, normalizeActor, unrestrictedActor } from '../manager-team-scope/manager-team-scope.js';
import { CreateAssignmentInput, UpdateAssignmentStatusInput } from './assignments.schemas.js';

const assignmentSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  userId: true,
  groupId: true,
  status: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAssignments(actorInput: TeamScopeActor | string, userId: string | undefined, page: number, pageSize: number, instructorId?: string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId,
      ...(userId !== undefined ? { userId } : {}),
      ...(instructorId ? { course: { instructors: { some: { instructorId, organizationId } } } } : {}),
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

    return this.prisma.assignment.create({
      data: input,
      select: assignmentSelect,
    });
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
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }
}

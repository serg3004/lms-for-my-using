import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
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
  constructor(private readonly prisma: PrismaService) {}

  async listAssignments(organizationId: string) {
    return this.prisma.assignment.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: assignmentSelect,
    });
  }

  async getAssignment(assignmentId: string, organizationId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        organizationId,
        deletedAt: null,
      },
      select: assignmentSelect,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async createAssignment(input: CreateAssignmentInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.userId) {
      await this.ensureUserExists(input.userId, input.organizationId);
    }

    if (input.groupId) {
      await this.ensureGroupExists(input.groupId, input.organizationId);
    }

    return this.prisma.assignment.create({
      data: input,
      select: assignmentSelect,
    });
  }

  async updateAssignmentStatus(
    assignmentId: string,
    organizationId: string,
    status: UpdateAssignmentStatusInput['status'],
  ) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return this.prisma.assignment.update({
      where: { id: assignmentId },
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

  private async ensureGroupExists(groupId: string, organizationId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }
}

/// <reference types="jest" />

import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import type { PrismaService } from '../database/prisma.service.js';
import { AssessmentAttemptsService } from '../modules/assessment-attempts/assessment-attempts.service.js';
import { AssignmentsService } from '../modules/assignments/assignments.service.js';
import { CertificatesService } from '../modules/certificates/certificates.service.js';
import { CoursesService } from '../modules/courses/courses.service.js';
import { LessonsService } from '../modules/lessons/lessons.service.js';
import { UsersService } from '../modules/users/users.service.js';

const organizationId = 'organization-a';
const foreignResourceId = 'resource-from-organization-b';
const actor = { id: 'admin-a', organizationId, roles: ['admin'] as const };

function prismaMock(overrides: Record<string, unknown>) {
  return overrides as unknown as PrismaService;
}

describe('Cross-tenant IDOR audit', () => {
  it('scopes course reads and the final PATCH mutation to the current organization', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: foreignResourceId, slug: 'course' });
    const update = jest.fn().mockResolvedValue({ id: foreignResourceId });
    const service = new CoursesService(prismaMock({ course: { findFirst, update } }));

    await service.updateCourse(foreignResourceId, organizationId, { title: 'Updated' });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: foreignResourceId, organizationId },
    }));
  });

  it('scopes lesson reads and the final DELETE mutation to the current organization', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: foreignResourceId });
    const update = jest.fn().mockResolvedValue({ id: foreignResourceId });
    const service = new LessonsService(prismaMock({ lesson: { findFirst, update } }));

    await service.deleteLesson(foreignResourceId, organizationId);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: foreignResourceId, organizationId },
    }));
  });

  it('does not return a user UUID unless it belongs to the actor organization', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new UsersService(prismaMock({ user: { findFirst } }));

    await expect(service.getUser(foreignResourceId, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
  });

  it('does not return an attempt UUID unless it belongs to the actor organization', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new AssessmentAttemptsService(prismaMock({ assessmentAttempt: { findFirst } }));

    await expect(service.getAttempt(foreignResourceId, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
  });

  it('rejects cross-tenant certificate relations before creating them', async () => {
    const courseFindFirst = jest.fn().mockResolvedValue(null);
    const certificateCreate = jest.fn();
    const service = new CertificatesService(prismaMock({
      course: { findFirst: courseFindFirst },
      certificate: { create: certificateCreate },
    }));

    await expect(service.issueCertificate({
      organizationId,
      courseId: foreignResourceId,
      userId: actor.id,
    }, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(courseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
    expect(certificateCreate).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant assignment relations before creating them', async () => {
    const courseFindFirst = jest.fn().mockResolvedValue(null);
    const assignmentCreate = jest.fn();
    const service = new AssignmentsService(prismaMock({
      course: { findFirst: courseFindFirst },
      assignment: { create: assignmentCreate },
    }));

    await expect(service.createAssignment({
      organizationId,
      courseId: foreignResourceId,
      userId: actor.id,
      status: 'assigned',
    }, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(courseFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: foreignResourceId, organizationId }),
    }));
    expect(assignmentCreate).not.toHaveBeenCalled();
  });
});

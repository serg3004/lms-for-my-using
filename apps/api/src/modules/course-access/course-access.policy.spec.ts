import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseAccessPolicy, CourseScopedUser } from './course-access.policy.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const instructorId = '22222222-2222-2222-2222-222222222222';
const courseId = '33333333-3333-3333-3333-333333333333';

const user = (roles: CourseScopedUser['roles']): CourseScopedUser => ({ id: instructorId, organizationId, roles });

describe('CourseAccessPolicy', () => {
  it('scopes an instructor, including a user who is also a learner', () => {
    const policy = new CourseAccessPolicy({} as PrismaService);
    expect(policy.isInstructorScoped(user(['instructor']))).toBe(true);
    expect(policy.isInstructorScoped(user(['learner', 'instructor']))).toBe(true);
  });

  it('keeps admin access unrestricted even when admin also has instructor role', async () => {
    const findFirst = jest.fn();
    const policy = new CourseAccessPolicy({ course: { findFirst } } as unknown as PrismaService);
    await expect(policy.assertCourseAccess(courseId, user(['instructor', 'admin']))).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('allows an assigned course and includes tenant ownership in the lookup', async () => {
    const findFirst = jest.fn(async () => ({ id: courseId }));
    const policy = new CourseAccessPolicy({ course: { findFirst } } as unknown as PrismaService);
    await expect(policy.assertCourseAccess(courseId, user(['instructor']))).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
        instructors: { some: { instructorId, organizationId, deletedAt: null } },
      },
      select: { id: true },
    });
  });

  it('hides a foreign course with the same not-found contract as a missing course', async () => {
    const policy = new CourseAccessPolicy({
      course: { findFirst: async () => null },
    } as unknown as PrismaService);
    await expect(policy.assertCourseAccess(courseId, user(['instructor']))).rejects.toThrow(NotFoundException);
  });

  it('checks resource ownership in a single query joined through its course', async () => {
    const resourceId = '44444444-4444-4444-4444-444444444444';
    const lessonFindFirst = jest.fn(async () => ({ id: resourceId }));
    const courseFindFirst = jest.fn();
    const policy = new CourseAccessPolicy({
      lesson: { findFirst: lessonFindFirst },
      course: { findFirst: courseFindFirst },
    } as unknown as PrismaService);

    await policy.assertResourceAccess('lesson', resourceId, user(['instructor']));

    expect(lessonFindFirst).toHaveBeenCalledWith({
      where: {
        id: resourceId,
        organizationId,
        deletedAt: null,
        course: {
          organizationId,
          deletedAt: null,
          instructors: { some: { instructorId, organizationId, deletedAt: null } },
        },
      },
      select: { id: true },
    });
    expect(courseFindFirst).not.toHaveBeenCalled();
  });

  it('joins two levels deep for attempt/question resources (via assessment.course)', async () => {
    const resourceId = '55555555-5555-5555-5555-555555555555';
    const attemptFindFirst = jest.fn(async () => ({ id: resourceId }));
    const policy = new CourseAccessPolicy({
      assessmentAttempt: { findFirst: attemptFindFirst },
    } as unknown as PrismaService);

    await policy.assertResourceAccess('attempt', resourceId, user(['instructor']));

    expect(attemptFindFirst).toHaveBeenCalledWith({
      where: {
        id: resourceId,
        organizationId,
        deletedAt: null,
        assessment: {
          course: {
            organizationId,
            deletedAt: null,
            instructors: { some: { instructorId, organizationId, deletedAt: null } },
          },
        },
      },
      select: { id: true },
    });
  });

  it('joins three levels deep for option resources (via question.assessment.course)', async () => {
    const resourceId = '66666666-6666-6666-6666-666666666666';
    const optionFindFirst = jest.fn(async () => ({ id: resourceId }));
    const policy = new CourseAccessPolicy({
      assessmentAnswerOption: { findFirst: optionFindFirst },
    } as unknown as PrismaService);

    await policy.assertResourceAccess('option', resourceId, user(['instructor']));

    expect(optionFindFirst).toHaveBeenCalledWith({
      where: {
        id: resourceId,
        organizationId,
        deletedAt: null,
        question: {
          assessment: {
            course: {
              organizationId,
              deletedAt: null,
              instructors: { some: { instructorId, organizationId, deletedAt: null } },
            },
          },
        },
      },
      select: { id: true },
    });
  });

  it('rejects a resource that does not resolve to an owned course', async () => {
    const policy = new CourseAccessPolicy({
      lesson: { findFirst: async () => null },
    } as unknown as PrismaService);

    await expect(
      policy.assertResourceAccess('lesson', '44444444-4444-4444-4444-444444444444', user(['instructor'])),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates an ownership assignment for an instructor-created course', async () => {
    const upsert = jest.fn(async () => ({}));
    const policy = new CourseAccessPolicy({ courseInstructor: { upsert } } as unknown as PrismaService);
    await policy.assignInstructor(courseId, user(['instructor']));
    expect(upsert).toHaveBeenCalledWith({
      where: { courseId_instructorId: { courseId, instructorId } },
      create: { courseId, instructorId, organizationId },
      update: { deletedAt: null },
    });
  });

  it('assigns instructor ownership through an explicit transaction client when provided', async () => {
    const defaultUpsert = jest.fn();
    const txUpsert = jest.fn(async () => ({}));
    const policy = new CourseAccessPolicy({ courseInstructor: { upsert: defaultUpsert } } as unknown as PrismaService);

    const tx = { courseInstructor: { upsert: txUpsert } } as unknown as PrismaService;
    await policy.assignInstructor(courseId, user(['instructor']), tx);

    expect(txUpsert).toHaveBeenCalledWith({
      where: { courseId_instructorId: { courseId, instructorId } },
      create: { courseId, instructorId, organizationId },
      update: { deletedAt: null },
    });
    expect(defaultUpsert).not.toHaveBeenCalled();
  });

  it('does nothing for admins assigning themselves (no instructor scoping)', async () => {
    const upsert = jest.fn();
    const policy = new CourseAccessPolicy({ courseInstructor: { upsert } } as unknown as PrismaService);
    await policy.assignInstructor(courseId, user(['admin']));
    expect(upsert).not.toHaveBeenCalled();
  });
});

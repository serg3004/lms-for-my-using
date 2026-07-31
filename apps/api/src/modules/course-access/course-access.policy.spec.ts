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
        instructors: { some: { instructorId, organizationId } },
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

  it('resolves a child resource to its course before checking ownership', async () => {
    const courseFindFirst = jest.fn(async () => ({ id: courseId }));
    const policy = new CourseAccessPolicy({
      lesson: { findFirst: async () => ({ courseId }) },
      course: { findFirst: courseFindFirst },
    } as unknown as PrismaService);
    await policy.assertResourceAccess('lesson', '44444444-4444-4444-4444-444444444444', user(['instructor']));
    expect(courseFindFirst).toHaveBeenCalled();
  });

  it('creates an ownership assignment for an instructor-created course', async () => {
    const create = jest.fn(async () => ({}));
    const policy = new CourseAccessPolicy({ courseInstructor: { create } } as unknown as PrismaService);
    await policy.assignInstructor(courseId, user(['instructor']));
    expect(create).toHaveBeenCalledWith({ data: { courseId, instructorId, organizationId } });
  });
});

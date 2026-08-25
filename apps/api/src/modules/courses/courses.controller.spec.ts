import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/public.js';
import type { CourseAccessPolicy } from '../course-access/public.js';
import { CoursesController } from './courses.controller.js';
import type { CoursesService } from './courses.service.js';

describe('CoursesController summaries', () => {
  it.each([
    { roles: ['instructor'], scoped: true, expectedInstructorId: 'user-1' },
    { roles: ['manager'], scoped: false, expectedInstructorId: undefined },
  ] as const)(
    'uses authenticated organization and instructor scope for $roles',
    ({ roles, scoped, expectedInstructorId }) => {
      const listCourseSummaries = jest.fn();
      const service = { listCourseSummaries } as unknown as CoursesService;
      const courseAccess = { isInstructorScoped: jest.fn(() => scoped) } as unknown as CourseAccessPolicy;
      const controller = new CoursesController(service, courseAccess);
      const request = {
        currentUser: { id: 'user-1', organizationId: 'org-1', roles },
      } as unknown as AuthenticatedRequest;

      controller.listCourseSummaries(request, { page: '2', pageSize: '25' });

      expect(courseAccess.isInstructorScoped).toHaveBeenCalledWith(request.currentUser);
      expect(listCourseSummaries).toHaveBeenCalledWith('org-1', 2, 25, expectedInstructorId);
    },
  );

  it('applies instructor scope to the regular course list', () => {
    const listCourses = jest.fn();
    const service = { listCourses } as unknown as CoursesService;
    const courseAccess = { isInstructorScoped: jest.fn(() => true) } as unknown as CourseAccessPolicy;
    const controller = new CoursesController(service, courseAccess);
    const request = {
      currentUser: { id: 'user-1', organizationId: 'org-1', roles: ['instructor'] },
    } as unknown as AuthenticatedRequest;

    controller.listCourses(request, {});

    expect(listCourses).toHaveBeenCalledWith('org-1', 1, 20, 'user-1', false);
  });

  it('checks course access before returning an individual course', async () => {
    const getCourse = jest.fn(async () => ({ id: 'course-1' }));
    const assertCourseAccess = jest.fn(async () => undefined);
    const controller = new CoursesController(
      { getCourse } as unknown as CoursesService,
      { assertCourseAccess } as unknown as CourseAccessPolicy,
    );
    const request = {
      currentUser: { id: 'user-1', organizationId: 'org-1', roles: ['instructor'] },
    } as unknown as AuthenticatedRequest;

    await expect(controller.getCourse('course-1', request)).resolves.toEqual({ id: 'course-1' });
    expect(assertCourseAccess).toHaveBeenCalledWith('course-1', request.currentUser);
    expect(getCourse).toHaveBeenCalledWith('course-1', 'org-1', false);
  });
});

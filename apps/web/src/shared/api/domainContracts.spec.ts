import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../apiClient.js', () => ({ apiRequest }));

import {
  createAssessmentAttempt, getAssessment, getAttemptResult, listAssessments,
} from './assessments.js';
import { createAssignment, getAssignment, listAssignments } from './assignments.js';
import {
  createCourse, deleteCourse, getCourse, listCourses, updateCourse,
} from './courses.js';
import {
  createLesson, getLesson, listLessons, updateLesson,
} from './lessons.js';
import { getManagerTeamSummary } from './manager.js';
import { listCourseMaterials } from './materials.js';
import { listMemberships } from './memberships.js';
import { getOrganization } from './organizations.js';
import { listUsers } from './users.js';

afterEach(() => apiRequest.mockReset());

describe('domain API contracts', () => {
  it('builds assessment requests and mutation bodies', async () => {
    await listAssessments();
    await getAssessment('assessment / 1');
    await createAssessmentAttempt('assessment / 1', [{ questionId: 'q1', selectedOptionId: 'o1' }]);
    await getAttemptResult('attempt / 1');

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/assessments');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/assessments/assessment%20%2F%201');
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/assessments/assessment%20%2F%201/attempts', {
      method: 'POST',
      body: JSON.stringify({ answers: [{ questionId: 'q1', selectedOptionId: 'o1' }] }),
    });
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/attempts/attempt%20%2F%201/result');
  });

  it('builds assignment list, detail, and create requests', async () => {
    const input = { organizationId: 'org', courseId: 'course', userId: 'user' };
    await listAssignments();
    await listAssignments({ page: 2, pageSize: 10 });
    await getAssignment('assignment / 1');
    await createAssignment(input);

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/assignments');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/assignments?page=2&pageSize=10');
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/assignments/assignment%20%2F%201');
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/assignments', { method: 'POST', body: JSON.stringify(input) });
  });

  it('builds every course CRUD request', async () => {
    const createInput = { organizationId: 'org', title: 'Course', slug: 'course' };
    const updateInput = { title: 'Updated' };
    await listCourses();
    await listCourses({ page: 3, pageSize: 5 });
    await getCourse('course / 1');
    await createCourse(createInput);
    await updateCourse('course / 1', updateInput);
    await deleteCourse('course / 1');

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/courses');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/courses?page=3&pageSize=5');
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/courses/course%20%2F%201');
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/courses', { method: 'POST', body: JSON.stringify(createInput) });
    expect(apiRequest).toHaveBeenNthCalledWith(5, '/courses/course%20%2F%201', { method: 'PATCH', body: JSON.stringify(updateInput) });
    expect(apiRequest).toHaveBeenNthCalledWith(6, '/courses/course%20%2F%201', { method: 'DELETE' });
  });

  it('builds lesson read and mutation requests', async () => {
    const createInput = { organizationId: 'org', title: 'Lesson', slug: 'lesson' };
    const updateInput = { title: 'Updated' };
    await listLessons('course / 1');
    await getLesson('lesson / 1');
    await createLesson('course / 1', createInput);
    await updateLesson('lesson / 1', updateInput);

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/courses/course%20%2F%201/lessons');
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/lessons/lesson%20%2F%201');
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/courses/course%20%2F%201/lessons', { method: 'POST', body: JSON.stringify(createInput) });
    expect(apiRequest).toHaveBeenNthCalledWith(4, '/lessons/lesson%20%2F%201', { method: 'PATCH', body: JSON.stringify(updateInput) });
  });

  it('covers small read-only domain wrappers and query encoding', async () => {
    await getManagerTeamSummary();
    await listCourseMaterials('course / 1');
    await listMemberships();
    await getOrganization('org / 1');
    await listUsers();
    await listUsers({ page: 2, pageSize: 50 });

    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      '/manager/team-summary',
      '/courses/course%20%2F%201/materials',
      '/memberships',
      '/organizations/org%20%2F%201',
      '/users',
      '/users?page=2&pageSize=50',
    ]);
  });
});

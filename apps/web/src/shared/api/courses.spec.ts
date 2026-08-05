import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import { addCourseInstructor, getCoursePath, listCourseInstructors, removeCourseInstructor } from './courses.js';

describe('courses api paths', () => {
  it('builds course detail path for a regular id', () => {
    expect(getCoursePath('course-1')).toBe('/courses/course-1');
  });

  it('encodes course ids before adding them to the path', () => {
    expect(getCoursePath('course 1/2')).toBe('/courses/course%201%2F2');
  });
});

describe('course instructor management', () => {
  it('lists instructors for a course', async () => {
    mocks.apiRequest.mockResolvedValueOnce([]);
    await listCourseInstructors('course-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/courses/course-1/instructors');
  });

  it('adds an instructor by id', async () => {
    mocks.apiRequest.mockResolvedValueOnce([]);
    await addCourseInstructor('course-1', 'user-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/courses/course-1/instructors', {
      method: 'POST',
      body: JSON.stringify({ instructorId: 'user-1' }),
    });
  });

  it('removes an instructor by id, encoding it in the path', async () => {
    mocks.apiRequest.mockResolvedValueOnce([]);
    await removeCourseInstructor('course-1', 'user 1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/courses/course-1/instructors/user%201', { method: 'DELETE' });
  });
});

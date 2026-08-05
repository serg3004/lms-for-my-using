import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteLesson,
  getCourseLessonsPath,
  getLessonPath,
  listAllLessons,
  markLessonComplete,
  markLessonCompleted,
  reorderLessons,
} from './lessons.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJsonFetch(responseBody: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('lessons api paths', () => {
  it('builds course lessons path', () => {
    expect(getCourseLessonsPath('course-1')).toBe('/courses/course-1/lessons');
  });

  it('encodes course ids before adding them to the lessons path', () => {
    expect(getCourseLessonsPath('course 1/2')).toBe('/courses/course%201%2F2/lessons');
  });

  it('encodes lesson ids before adding them to the detail path', () => {
    expect(getLessonPath('lesson 1/2')).toBe('/lessons/lesson%201%2F2');
  });
});

describe('lessons api mutations', () => {
  it('lists all lessons without params', async () => {
    const fetchMock = mockJsonFetch({ items: [], total: 0 });

    await listAllLessons();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/lessons', expect.anything());
  });

  it('lists all lessons with a query string built from params', async () => {
    const fetchMock = mockJsonFetch({ items: [], total: 0 });

    await listAllLessons({ page: 2, pageSize: 50 });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/lessons?page=2&pageSize=50', expect.anything());
  });

  it('reorders lessons', async () => {
    const fetchMock = mockJsonFetch([]);

    await reorderLessons('course-1', ['lesson-2', 'lesson-1']);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/courses/course-1/lessons/order',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ lessonIds: ['lesson-2', 'lesson-1'] }),
      }),
    );
  });

  it('deletes lessons', async () => {
    const fetchMock = mockJsonFetch(null);

    await deleteLesson('lesson-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/lessons/lesson-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('marks lessons complete with either export name', async () => {
    const fetchMock = mockJsonFetch({ id: 'progress-1' });

    await markLessonComplete({
      organizationId: 'org-1',
      courseId: 'course-1',
      lessonId: 'lesson-1',
      userId: 'user-1',
    });
    await markLessonCompleted({
      organizationId: 'org-1',
      courseId: 'course-1',
      lessonId: 'lesson-1',
      userId: 'user-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

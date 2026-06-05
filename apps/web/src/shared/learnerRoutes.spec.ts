import { describe, expect, it } from 'vitest';

import { getCourseHref, getCourseLessonsHref, getLessonHref } from './learnerRoutes.js';

describe('learnerRoutes', () => {
  it('getCourseHref builds course detail URL', () => {
    expect(getCourseHref('course-1')).toBe('/learn/courses/course-1');
  });

  it('getCourseHref encodes special characters', () => {
    expect(getCourseHref('course/with spaces')).toBe('/learn/courses/course%2Fwith%20spaces');
  });

  it('getLessonHref builds lesson detail URL', () => {
    expect(getLessonHref('lesson-1')).toBe('/learn/lessons/lesson-1');
  });

  it('getLessonHref encodes special characters', () => {
    expect(getLessonHref('lesson/1')).toBe('/learn/lessons/lesson%2F1');
  });

  it('getCourseLessonsHref builds course lessons URL', () => {
    expect(getCourseLessonsHref('course-1')).toBe('/learn/courses/course-1/lessons');
  });

  it('getCourseLessonsHref encodes special characters', () => {
    expect(getCourseLessonsHref('course/1')).toBe('/learn/courses/course%2F1/lessons');
  });
});

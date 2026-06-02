import { describe, expect, it } from 'vitest';

import { getCourseLessonsPath, getLessonPath } from './lessons.js';

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

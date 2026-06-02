import { describe, expect, it } from 'vitest';

import { getCoursePath } from './courses.js';

describe('courses api paths', () => {
  it('builds course detail path for a regular id', () => {
    expect(getCoursePath('course-1')).toBe('/courses/course-1');
  });

  it('encodes course ids before adding them to the path', () => {
    expect(getCoursePath('course 1/2')).toBe('/courses/course%201%2F2');
  });
});

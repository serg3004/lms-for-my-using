import { describe, expect, it } from 'vitest';

import { getCourseMaterialsPath } from './materials.js';

describe('materials api paths', () => {
  it('builds course materials path for a regular id', () => {
    expect(getCourseMaterialsPath('course-1')).toBe('/courses/course-1/materials');
  });

  it('encodes course ids before adding them to the path', () => {
    expect(getCourseMaterialsPath('course 1/2')).toBe('/courses/course%201%2F2/materials');
  });
});

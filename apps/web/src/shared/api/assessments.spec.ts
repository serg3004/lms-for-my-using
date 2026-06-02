import { describe, expect, it } from 'vitest';

import { getAssessmentPath } from './assessments.js';

describe('assessments api paths', () => {
  it('builds assessment detail path for a regular id', () => {
    expect(getAssessmentPath('assessment-1')).toBe('/assessments/assessment-1');
  });

  it('encodes assessment ids before adding them to the path', () => {
    expect(getAssessmentPath('assessment 1/2')).toBe('/assessments/assessment%201%2F2');
  });
});

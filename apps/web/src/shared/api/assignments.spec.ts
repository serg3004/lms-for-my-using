import { describe, expect, it } from 'vitest';

import { getAssignmentPath } from './assignments.js';

describe('assignments api paths', () => {
  it('builds assignment detail path for a regular id', () => {
    expect(getAssignmentPath('assignment-1')).toBe('/assignments/assignment-1');
  });

  it('encodes assignment ids before adding them to the path', () => {
    expect(getAssignmentPath('assignment 1/2')).toBe('/assignments/assignment%201%2F2');
  });
});

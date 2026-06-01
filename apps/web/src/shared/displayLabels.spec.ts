import { describe, expect, it } from 'vitest';

import { getListItemLabel, getReadableTitle } from './displayLabels.js';

describe('displayLabels', () => {
  it('returns readable title when available', () => {
    expect(getReadableTitle('Course onboarding', 'Course')).toBe('Course onboarding');
  });

  it('falls back when title is missing or blank', () => {
    expect(getReadableTitle(null, 'Course')).toBe('Course');
    expect(getReadableTitle('   ', 'Course')).toBe('Course');
  });

  it('builds stable list item labels without exposing technical ids', () => {
    expect(getListItemLabel('Assignment', 1)).toBe('Assignment 2');
  });
});

import { describe, expect, it } from 'vitest';

import {
  findCourseTitle,
  findUserEmail,
  findUserLabel,
  progressPercent,
} from './AdminResultsCertificatesPage.js';

const courses = [{ id: 'course-1', organizationId: 'org-1', title: 'Safety training' }];
const users = [{ id: 'user-1', email: 'ann@example.com', name: 'Ann' }, { id: 'user-2', email: 'bob@example.com', name: null }];

describe('AdminResultsCertificatesPage helpers', () => {
  it('finds a course title by id', () => {
    expect(findCourseTitle(courses, 'course-1')).toBe('Safety training');
  });

  it('falls back to the id when a course is not found', () => {
    expect(findCourseTitle(courses, 'missing')).toBe('missing');
  });

  it('prefers the user name over email for the label', () => {
    expect(findUserLabel(users, 'user-1')).toBe('Ann');
  });

  it('falls back to email when the user has no name', () => {
    expect(findUserLabel(users, 'user-2')).toBe('bob@example.com');
  });

  it('falls back to the id when a user is not found', () => {
    expect(findUserLabel(users, 'missing')).toBe('missing');
  });

  it('returns the user email', () => {
    expect(findUserEmail(users, 'user-1')).toBe('ann@example.com');
  });

  it('returns an empty string when the user is not found', () => {
    expect(findUserEmail(users, 'missing')).toBe('');
  });

  it('treats completed progress as 100%', () => {
    expect(progressPercent({ id: 'p1', courseId: 'course-1', userId: 'user-1', status: 'completed', score: 40, completedAt: null })).toBe(100);
  });

  it('uses the score for in-progress records', () => {
    expect(progressPercent({ id: 'p1', courseId: 'course-1', userId: 'user-1', status: 'in_progress', score: 55, completedAt: null })).toBe(55);
  });

  it('treats a missing score as 0% progress', () => {
    expect(progressPercent({ id: 'p1', courseId: 'course-1', userId: 'user-1', status: 'in_progress', score: null, completedAt: null })).toBe(0);
  });
});

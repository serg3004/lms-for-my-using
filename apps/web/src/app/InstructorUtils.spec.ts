import { describe, expect, it } from 'vitest';

import { buildStudentRows } from './InstructorCourseStudentsPage';
import { computeStats } from './InstructorDashboardPage';

describe('computeStats', () => {
  it('counts published vs draft and unique students enrolled', () => {
    const courses = [
      { id: '1', status: 'published' },
      { id: '2', status: 'published' },
      { id: '3', status: 'draft' },
    ] as Parameters<typeof computeStats>[0];
    const progress = [
      { userId: 'u1', status: 'completed' },
      { userId: 'u2', status: 'in_progress' },
      { userId: 'u1', status: 'completed' },
    ];

    expect(computeStats(courses, progress)).toEqual({
      total: 3,
      published: 2,
      draft: 1,
      studentsEnrolled: 2,
      completionPercent: 67,
    });
  });

  it('returns zeros for empty input', () => {
    expect(computeStats([], [])).toEqual({ total: 0, published: 0, draft: 0, studentsEnrolled: 0, completionPercent: 0 });
  });
});

describe('buildStudentRows', () => {
  it('filters by courseId, aggregates completed/inProgress, joins user data', () => {
    const progress = [
      { courseId: 'c1', userId: 'u1', status: 'completed', user: { firstName: 'Алексей', lastName: 'Морозов', email: 'am@test.com' } },
      { courseId: 'c1', userId: 'u1', status: 'in_progress', user: { firstName: 'Алексей', lastName: 'Морозов', email: 'am@test.com' } },
      { courseId: 'c1', userId: 'u2', status: 'completed', user: { firstName: 'Наталья', lastName: null, email: 'nk@test.com' } },
      { courseId: 'c2', userId: 'u1', status: 'completed', user: { firstName: 'Алексей', lastName: 'Морозов', email: 'am@test.com' } },
    ] as Parameters<typeof buildStudentRows>[0];

    const rows = buildStudentRows(progress, 'c1');
    expect(rows).toHaveLength(2);

    const u1 = rows.find((r) => r.userId === 'u1')!;
    expect(u1.name).toBe('Алексей Морозов');
    expect(u1.lessonsCompleted).toBe(1);
    expect(u1.lessonsInProgress).toBe(1);

    const u2 = rows.find((r) => r.userId === 'u2')!;
    expect(u2.name).toBe('Наталья');
    expect(u2.email).toBe('nk@test.com');
  });

  it('returns empty array when no progress for the given course', () => {
    expect(buildStudentRows([], 'any-course')).toEqual([]);
  });
});

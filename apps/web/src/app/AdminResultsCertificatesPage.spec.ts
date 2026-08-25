import { describe, expect, it } from 'vitest';

import { formatNullableDate } from '../shared/formatDate.js';

import {
  buildAssessmentResultsExportRows,
  buildProgressExportRows,
  findCourseTitle,
  findUserEmail,
  findUserLabel,
  progressPercent,
  serializeCsv,
} from './AdminResultsCertificatesPage.js';

const courses = [{ id: 'course-1', organizationId: 'org-1', title: 'Safety training' }];
const users = [{ id: 'user-1', email: 'ann@example.com', name: 'Ann' }, { id: 'user-2', email: 'bob@example.com', name: null }];
const t = ((key: string, fallback?: string) => fallback ?? key) as never;

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

describe('progress CSV export', () => {
  it('quotes commas, quotes, line breaks and empty values without adding sensitive fields', () => {
    const specialCourses = [{ id: 'course-1', organizationId: 'org-1', title: 'Safety, "first"\nline' }];
    const specialUsers = [{ id: 'user-1', email: 'ann@example.com', name: 'Ann, "A"' }];
    const progress = [{ id: 'p1', courseId: 'course-1', userId: 'user-1', status: 'in_progress', score: null, completedAt: null }];

    const rows = buildProgressExportRows(specialCourses, specialUsers, progress, t);
    const csv = serializeCsv(rows);

    expect(csv).toContain('"Ann, ""A"""');
    expect(csv).toContain('"Safety, ""first""\nline"');
    expect(csv).toContain('""');
    expect(rows[0]).toEqual(['Learner', 'Course', 'Progress', 'Score']);
    expect(csv).not.toContain('ann@example.com');
  });

  it('keeps an explicit header for an empty report instead of producing an empty file', () => {
    expect(serializeCsv(buildProgressExportRows(courses, users, [], t))).toBe(
      '"Learner","Course","Progress","Score"',
    );
  });
});

describe('buildAssessmentResultsExportRows', () => {
  it('builds a header row plus one row per result, resolving learner labels and pass/fail text', () => {
    const results = [
      { id: 'r1', assessmentId: 'a1', userId: 'user-1', score: 8, maxScore: 10, percentage: 80, passed: true, completedAt: '2026-01-05T12:00:00.000Z' },
      { id: 'r2', assessmentId: 'a1', userId: 'user-2', score: 4, maxScore: 10, percentage: 40, passed: false, completedAt: null },
    ];

    expect(buildAssessmentResultsExportRows(results, users, t)).toEqual([
      ['Learner', 'Score', 'Status', 'Date'],
      ['Ann', '8/10 (80%)', 'Passed', formatNullableDate('2026-01-05T12:00:00.000Z', '—')],
      ['bob@example.com', '4/10 (40%)', 'Failed', '—'],
    ]);
  });

  it('returns just the header row when there are no results', () => {
    expect(buildAssessmentResultsExportRows([], users, t)).toEqual([['Learner', 'Score', 'Status', 'Date']]);
  });
});

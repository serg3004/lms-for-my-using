import { describe, expect, it } from 'vitest';

import type { CourseCompletion, CourseSummary } from '../shared/api/types.js';
import { mergeCourseProgress } from './LearnerCoursesPage.js';

function makeCourse(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    id: 'course-1',
    organizationId: 'org-1',
    title: 'Course',
    slug: 'course',
    description: null,
    category: null,
    durationMinutes: null,
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

type Completion = Pick<CourseCompletion, 'totalLessons' | 'completedLessons' | 'percentage' | 'isCompleted'>;

function makeCompletion(overrides: Partial<Completion> = {}): Completion {
  return { totalLessons: 0, completedLessons: 0, percentage: 0, isCompleted: false, ...overrides };
}

describe('mergeCourseProgress (UX-PROGRESS-001)', () => {
  it('derives the card percentage from the canonical lessons-completed/total contract, not course lifecycle status', () => {
    const courses = [makeCourse({ id: 'course-1', status: 'archived' })];
    const completions = [makeCompletion({ totalLessons: 5, completedLessons: 2, percentage: 40, isCompleted: false })];

    const [result] = mergeCourseProgress(courses, completions);

    expect(result).toMatchObject({ totalLessons: 5, completedLessons: 2, percentage: 40, isCompleted: false });
  });

  it('reports 100% only when the learner actually completed every lesson, regardless of course status', () => {
    const courses = [makeCourse({ id: 'course-1', status: 'published' })];
    const completions = [makeCompletion({ totalLessons: 3, completedLessons: 3, percentage: 100, isCompleted: true })];

    const [result] = mergeCourseProgress(courses, completions);

    expect(result.percentage).toBe(100);
    expect(result.isCompleted).toBe(true);
  });

  it('reports 0% for a published course the learner has not started, instead of a lifecycle-derived guess', () => {
    const courses = [makeCourse({ id: 'course-1', status: 'published' })];
    const completions = [makeCompletion({ totalLessons: 4, completedLessons: 0, percentage: 0, isCompleted: false })];

    const [result] = mergeCourseProgress(courses, completions);

    expect(result.percentage).toBe(0);
    expect(result.isCompleted).toBe(false);
  });

  it('pairs each course with its own completion by array position, for multiple courses', () => {
    const courses = [
      makeCourse({ id: 'course-1' }),
      makeCourse({ id: 'course-2' }),
    ];
    const completions = [
      makeCompletion({ totalLessons: 10, completedLessons: 10, percentage: 100, isCompleted: true }),
      makeCompletion({ totalLessons: 10, completedLessons: 1, percentage: 10, isCompleted: false }),
    ];

    const result = mergeCourseProgress(courses, completions);

    expect(result[0]).toMatchObject({ id: 'course-1', percentage: 100, isCompleted: true });
    expect(result[1]).toMatchObject({ id: 'course-2', percentage: 10, isCompleted: false });
  });

  it('preserves the original course fields alongside the merged progress fields', () => {
    const courses = [makeCourse({ id: 'course-1', title: 'Onboarding' })];
    const completions = [makeCompletion({ totalLessons: 2, completedLessons: 1, percentage: 50, isCompleted: false })];

    const [result] = mergeCourseProgress(courses, completions);

    expect(result.title).toBe('Onboarding');
    expect(result.id).toBe('course-1');
  });
});

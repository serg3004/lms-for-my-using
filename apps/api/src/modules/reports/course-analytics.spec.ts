import { buildCourseUserRows, median, summarizeCourses, summarizeUser, type CourseAnalyticsInput } from './course-analytics.js';

const now = new Date('2026-11-19T00:00:00Z');
const d = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`);

const base: CourseAnalyticsInput = {
  now,
  assignments: [],
  lessons: [{ id: 'l1', courseId: 'c1' }, { id: 'l2', courseId: 'c1' }],
  progress: [],
  assessments: [{ id: 't1', courseId: 'c1' }],
  attempts: [],
  certificates: [],
};
const assign = (userId: string, dueAt: Date | null = null, completed = false) => ({ courseId: 'c1', userId, dueAt, completed });
const attempt = (userId: string, percentage: number, passed: boolean, startedAt = d(2)) => ({
  assessmentId: 't1', userId, status: 'completed' as const, percentage, score: percentage, passed, startedAt, completedAt: startedAt,
});
const lesson = (userId: string, lessonId: string, day: number) => ({
  courseId: 'c1', userId, lessonId, status: 'completed' as const, createdAt: d(1), completedAt: d(day),
});

describe('course analytics rules', () => {
  it('marks a user who finished lessons and passed the test as completed and passed, with calendar time', () => {
    const [row] = buildCourseUserRows({
      ...base, assignments: [assign('u1')],
      progress: [lesson('u1', 'l1', 2), lesson('u1', 'l2', 3)],
      attempts: [attempt('u1', 90, true)],
    });
    expect(row).toMatchObject({ status: 'completed', lessonsPercent: 100, testResult: 'passed', testPercent: 90, attempts: 1, durationMinutes: 2 * 24 * 60, overdue: false });
  });

  it('takes the best completed attempt: failed first, passed second counts as passed', () => {
    const [row] = buildCourseUserRows({ ...base, assignments: [assign('u1')], attempts: [attempt('u1', 40, false), attempt('u1', 80, true, d(3))] });
    expect(row).toMatchObject({ testResult: 'passed', testPercent: 80, attempts: 2, status: 'in_progress' });
  });

  it('reports failed when every attempt fails, and pending when the test was not tried', () => {
    const rows = buildCourseUserRows({ ...base, assignments: [assign('u1'), assign('u2')], attempts: [attempt('u1', 30, false)] });
    expect(rows.find((row) => row.userId === 'u1')?.testResult).toBe('failed');
    expect(rows.find((row) => row.userId === 'u2')).toMatchObject({ testResult: 'pending', status: 'not_started', testPercent: null, startedAt: null });
  });

  it('has no test result for a course without published tests', () => {
    const [row] = buildCourseUserRows({ ...base, assessments: [], assignments: [assign('u1')] });
    expect(row?.testResult).toBe('no_test');
  });

  it('flags an overdue unfinished assignment but not a finished one', () => {
    const rows = buildCourseUserRows({ ...base, assignments: [assign('u1', d(10)), assign('u2', d(10), true)] });
    expect(rows.find((row) => row.userId === 'u1')?.overdue).toBe(true);
    expect(rows.find((row) => row.userId === 'u2')).toMatchObject({ overdue: false, status: 'completed' });
  });

  it('merges several assignments of one pair into one row with the earliest due date', () => {
    const rows = buildCourseUserRows({ ...base, assignments: [assign('u1', d(15)), assign('u1', d(12))] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dueAt).toEqual(d(12));
  });

  it('does not count a user who has progress but no assignment', () => {
    const rows = buildCourseUserRows({ ...base, assignments: [assign('u1')], progress: [lesson('u2', 'l1', 2)] });
    expect(rows.map((row) => row.userId)).toEqual(['u1']);
  });

  it('summarizes a course and a user', () => {
    const rows = buildCourseUserRows({
      ...base, assignments: [assign('u1'), assign('u2'), assign('u3')],
      progress: [lesson('u1', 'l1', 2), lesson('u1', 'l2', 3)],
      attempts: [attempt('u1', 90, true), attempt('u2', 50, false)],
    });
    const [summary] = summarizeCourses(rows);
    expect(summary).toMatchObject({ assigned: 3, started: 2, completed: 1, completedPercent: 33, passed: 1, failed: 1, avgPercent: 70, medianPercent: 70 });
    expect(summarizeUser(rows.filter((row) => row.userId === 'u1'))).toEqual({ assigned: 1, completed: 1, passed: 1, avgPercent: 90, certificates: 0 });
  });

  it('computes the median of odd and even lists', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

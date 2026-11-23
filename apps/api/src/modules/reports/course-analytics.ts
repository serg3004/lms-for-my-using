/**
 * PR 473: the one place where course analytics are counted (like checklist-sheet-analytics.ts for checklists).
 * Pure functions over already loaded rows, so the rules are tested without a database.
 *
 * Rules (also written in docs/contracts/API_CONTRACTS.md):
 * - the population of a course is every user it is assigned to (directly, through a group or a department);
 *   a user with progress but no assignment is not counted;
 * - "completed" means every published lesson is completed, or the assignment itself is marked completed;
 * - tests: the best completed attempt (highest percentage) of each published test counts; attempts with
 *   countsTowardResults = false are ignored; the result is passed, failed, pending or no_test;
 * - time is calendar time from the first action to completion, in minutes (not active reading time).
 */

export type TestResult = 'passed' | 'failed' | 'pending' | 'no_test';

export type AnalyticsAssignment = {
  courseId: string;
  userId: string;
  dueAt: Date | null;
  completed: boolean;
};
export type AnalyticsLesson = { id: string; courseId: string };
export type AnalyticsProgress = {
  courseId: string;
  userId: string;
  lessonId: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt: Date | null;
};
export type AnalyticsAssessment = { id: string; courseId: string };
export type AnalyticsAttempt = {
  assessmentId: string;
  courseId: string | null;
  userId: string;
  status: 'in_progress' | 'completed';
  percentage: number;
  score: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
};
export type AnalyticsCertificate = { courseId: string; userId: string; status: 'issued' | 'revoked'; issuedAt: Date };

export type CourseUserRow = {
  courseId: string;
  userId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  lessonsTotal: number;
  lessonsCompleted: number;
  lessonsPercent: number;
  /** Best percentage over the published tests that were attempted, or null when there is none. */
  testPercent: number | null;
  testScore: number | null;
  attempts: number;
  testResult: TestResult;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMinutes: number | null;
  dueAt: Date | null;
  overdue: boolean;
  certificate: { status: 'issued' | 'revoked'; issuedAt: Date } | null;
};

export type CourseSummaryRow = {
  courseId: string;
  assigned: number;
  started: number;
  completed: number;
  completedPercent: number;
  passed: number;
  failed: number;
  overdue: number;
  avgPercent: number | null;
  medianPercent: number | null;
  avgDurationMinutes: number | null;
};

export type CourseAnalyticsInput = {
  now: Date;
  assignments: readonly AnalyticsAssignment[];
  lessons: readonly AnalyticsLesson[];
  progress: readonly AnalyticsProgress[];
  assessments: readonly AnalyticsAssessment[];
  attempts: readonly AnalyticsAttempt[];
  certificates: readonly AnalyticsCertificate[];
};

const key = (courseId: string, userId: string) => `${courseId}:${userId}`;

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = keyOf(item);
    const list = map.get(id);
    if (list) list.push(item);
    else map.set(id, [item]);
  }
  return map;
}

const earliest = (dates: Date[]) => dates.reduce<Date | null>((min, date) => (min === null || date < min ? date : min), null);
const latest = (dates: Date[]) => dates.reduce<Date | null>((max, date) => (max === null || date > max ? date : max), null);

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10;
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

/** One row per (course, user) pair of the assignments. */
export function buildCourseUserRows(input: CourseAnalyticsInput): CourseUserRow[] {
  const lessonsByCourse = groupBy(input.lessons, (lesson) => lesson.courseId);
  const assessmentsByCourse = groupBy(input.assessments, (assessment) => assessment.courseId);
  const progressByPair = groupBy(input.progress, (row) => key(row.courseId, row.userId));
  const attemptsByPair = groupBy(input.attempts, (attempt) => key(attempt.courseId ?? '', attempt.userId));
  const certificateByPair = new Map(input.certificates.map((certificate) => [key(certificate.courseId, certificate.userId), certificate]));
  const assignmentsByPair = groupBy(input.assignments, (assignment) => key(assignment.courseId, assignment.userId));

  const rows: CourseUserRow[] = [];
  for (const [pair, pairAssignments] of assignmentsByPair) {
    const { courseId, userId } = pairAssignments[0]!;
    const lessonIds = new Set((lessonsByCourse.get(courseId) ?? []).map((lesson) => lesson.id));
    const progress = progressByPair.get(pair) ?? [];

    const completedLessons = new Set(progress.filter((row) => row.status === 'completed' && row.lessonId && lessonIds.has(row.lessonId)).map((row) => row.lessonId!));
    const lessonsTotal = lessonIds.size;
    const lessonsCompleted = completedLessons.size;
    const allLessonsDone = lessonsTotal > 0 && lessonsCompleted >= lessonsTotal;

    const assessmentIds = new Set((assessmentsByCourse.get(courseId) ?? []).map((assessment) => assessment.id));
    const counted = (attemptsByPair.get(key(courseId, userId)) ?? []).filter((attempt) => assessmentIds.has(attempt.assessmentId) && attempt.status === 'completed');
    const bestByAssessment = new Map<string, AnalyticsAttempt>();
    for (const attempt of counted) {
      const best = bestByAssessment.get(attempt.assessmentId);
      if (!best || attempt.percentage > best.percentage) bestByAssessment.set(attempt.assessmentId, attempt);
    }
    const bests = [...bestByAssessment.values()];
    const allPassed = assessmentIds.size > 0 && bests.length === assessmentIds.size && bests.every((best) => best.passed);
    let testResult: TestResult;
    if (assessmentIds.size === 0) testResult = 'no_test';
    else if (allPassed) testResult = 'passed';
    else if (bests.some((best) => !best.passed)) testResult = 'failed';
    else testResult = 'pending';

    const completed = allLessonsDone || pairAssignments.some((assignment) => assignment.completed);
    const touched = progress.some((row) => row.status !== 'not_started') || (attemptsByPair.get(key(courseId, userId)) ?? []).some((attempt) => assessmentIds.has(attempt.assessmentId));
    const startedAt = earliest([
      ...progress.filter((row) => row.status !== 'not_started').map((row) => row.createdAt),
      ...(attemptsByPair.get(key(courseId, userId)) ?? []).filter((attempt) => assessmentIds.has(attempt.assessmentId)).map((attempt) => attempt.startedAt),
    ]);
    const completedAt = completed ? latest(progress.flatMap((row) => (row.completedAt ? [row.completedAt] : []))) : null;
    const durationMinutes = startedAt && completedAt && completedAt >= startedAt ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60_000) : null;

    const dueDates = pairAssignments.flatMap((assignment) => (assignment.dueAt ? [assignment.dueAt] : []));
    const dueAt = earliest(dueDates);
    const certificate = certificateByPair.get(pair);

    rows.push({
      courseId,
      userId,
      status: completed ? 'completed' : touched ? 'in_progress' : 'not_started',
      lessonsTotal,
      lessonsCompleted,
      lessonsPercent: lessonsTotal === 0 ? 0 : Math.round((Math.min(lessonsCompleted, lessonsTotal) / lessonsTotal) * 100),
      testPercent: bests.length === 0 ? null : Math.round(bests.reduce((sum, best) => sum + best.percentage, 0) / bests.length),
      testScore: bests.length === 0 ? null : bests.reduce((sum, best) => sum + best.score, 0),
      attempts: counted.length,
      testResult,
      startedAt,
      completedAt,
      durationMinutes,
      dueAt,
      overdue: !completed && dueAt !== null && dueAt < input.now,
      certificate: certificate ? { status: certificate.status, issuedAt: certificate.issuedAt } : null,
    });
  }
  return rows;
}

export function summarizeCourses(rows: readonly CourseUserRow[]): CourseSummaryRow[] {
  return [...groupBy(rows, (row) => row.courseId).entries()].map(([courseId, courseRows]) => {
    const percents = courseRows.flatMap((row) => (row.testPercent === null ? [] : [row.testPercent]));
    const durations = courseRows.flatMap((row) => (row.durationMinutes === null ? [] : [row.durationMinutes]));
    const completed = courseRows.filter((row) => row.status === 'completed').length;
    return {
      courseId,
      assigned: courseRows.length,
      started: courseRows.filter((row) => row.status !== 'not_started').length,
      completed,
      completedPercent: Math.round((completed / courseRows.length) * 100),
      passed: courseRows.filter((row) => row.testResult === 'passed').length,
      failed: courseRows.filter((row) => row.testResult === 'failed').length,
      overdue: courseRows.filter((row) => row.overdue).length,
      avgPercent: average(percents),
      medianPercent: median(percents),
      avgDurationMinutes: average(durations),
    };
  });
}

export type UserSummary = { assigned: number; completed: number; passed: number; avgPercent: number | null; certificates: number };

export function summarizeUser(rows: readonly CourseUserRow[]): UserSummary {
  return {
    assigned: rows.length,
    completed: rows.filter((row) => row.status === 'completed').length,
    passed: rows.filter((row) => row.testResult === 'passed').length,
    avgPercent: average(rows.flatMap((row) => (row.testPercent === null ? [] : [row.testPercent]))),
    certificates: rows.filter((row) => row.certificate?.status === 'issued').length,
  };
}

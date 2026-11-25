import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { frozenAssessmentQuestionSchema } from '../../common/assessment-frozen.js';

const frozenQuestionFields = frozenAssessmentQuestionSchema.pick({ title: true, text: true, options: true });
const analyticsAnswerSnapshot = z.object({ question: z.object(frozenQuestionFields.shape) });

export const assessmentAnalyticsCards = z.array(z.object({
  id: z.enum(['passRate', 'average', 'distribution', 'difficulty', 'traps', 'duration', 'trend', 'departments', 'employees']),
  enabled: z.boolean(),
})).max(9).refine((cards) => new Set(cards.map(({ id }) => id)).size === cards.length);

export const assessmentAnalyticsQuery = z.object({
  place: z.enum(['all', 'standalone', 'course', 'longread']).default('all'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  departmentId: z.guid().optional(),
  groupId: z.guid().optional(),
  userId: z.guid().optional(),
  attemptId: z.guid().optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
}).refine(({ from, to }) => !from || !to || from <= to);

export type AssessmentAnalyticsQuery = z.infer<typeof assessmentAnalyticsQuery>;

export const assessmentAnalyticsSelect = {
  id: true, userId: true, score: true, maxScore: true, percentage: true, passed: true,
  startedAt: true, completedAt: true, createdAt: true, courseId: true, placementId: true, longreadRevisionId: true,
  user: { select: {
    firstName: true, lastName: true,
    departmentMemberships: {
      where: { effectiveTo: null, isPrimary: true },
      select: { department: { select: { id: true, name: true } } },
    },
    groupMemberships: {
      where: { deletedAt: null, group: { deletedAt: null } },
      select: { group: { select: { id: true, name: true } } },
    },
  } },
} satisfies Prisma.AssessmentAttemptSelect;

type Attempt = Prisma.AssessmentAttemptGetPayload<{ select: typeof assessmentAnalyticsSelect }>;
type Option = { id: string; text: string | null; isCorrect: boolean };
type Question = { id: string; title: string; text: string | null; options: Option[] };

export function analyticsPlace(attempt: Pick<Attempt, 'longreadRevisionId' | 'courseId' | 'placementId'>) {
  if (attempt.longreadRevisionId) return 'longread';
  return attempt.courseId || attempt.placementId ? 'course' : 'standalone';
}

function addScore<Key>(groups: Map<Key, { name: string; count: number; sum: number }>, key: Key, name: string, score: number) {
  const group = groups.get(key) ?? { name, count: 0, sum: 0 };
  group.count++;
  group.sum += score;
  groups.set(key, group);
}

function averages<Key>(groups: Map<Key, { name: string; count: number; sum: number }>) {
  return [...groups].map(([id, { name, count, sum }]) => ({ id, name, count, value: Math.round(sum / count) }));
}

export type AssessmentAnalyticsAnswer = {
  questionId: string;
  isCorrect: boolean;
  selectedOptionId: string | null;
  selectedOptionIds: Prisma.JsonValue;
  frozenQuestion: Prisma.JsonValue;
  count: number;
};

export async function summarizeAssessment(
  attempts: Attempt[],
  legacyQuestions: Question[],
  query: AssessmentAnalyticsQuery,
  loadAnswers: (attemptIds: string[]) => Promise<AssessmentAnalyticsAnswer[]>,
) {
  const places = { standalone: 0, course: 0, longread: 0 };
  const distribution = Array<number>(10).fill(0);
  const dates = new Map<string, { name: string; count: number; sum: number }>();
  const departments = new Map<string, { name: string; count: number; sum: number }>();
  const employees = new Map<string, { name: string; count: number; sum: number }>();
  const departmentOptions = new Map<string, string>();
  const groupOptions = new Map<string, string>();
  const employeeOptions = new Map<string, string>();
  const questions = new Map<string, { text: string | null; total: number; correct: number; wrong: Map<string, { text: string | null; count: number }> }>();
  const legacy = new Map(legacyQuestions.map((question) => [question.id, question]));
  const pageSize = 25;
  const rows = [];
  const selectedAttemptIds: string[] = [];
  let count = 0;
  let passed = 0;
  let totalPercentage = 0;
  let timed = 0;
  let seconds = 0;

  for (const attempt of attempts) {
    const place = analyticsPlace(attempt);
    const department = attempt.user.departmentMemberships[0]?.department;
    const name = [attempt.user.lastName, attempt.user.firstName].filter(Boolean).join(' ');
    if (department) departmentOptions.set(department.id, department.name);
    employeeOptions.set(attempt.userId, name);
    for (const { group } of attempt.user.groupMemberships) groupOptions.set(group.id, group.name);

    if ((query.departmentId && department?.id !== query.departmentId)
      || (query.groupId && !attempt.user.groupMemberships.some(({ group }) => group.id === query.groupId))
      || (query.userId && attempt.userId !== query.userId)
      || (query.attemptId && attempt.id !== query.attemptId)) continue;

    places[place]++;
    if (query.place !== 'all' && query.place !== place) continue;
    selectedAttemptIds.push(attempt.id);

    const date = (attempt.completedAt ?? attempt.createdAt).toISOString().slice(0, 10);
    if (count >= (query.page - 1) * pageSize && rows.length < pageSize) {
      rows.push({ id: attempt.id, name, date, place, percentage: attempt.percentage, score: attempt.score, maxScore: attempt.maxScore, passed: attempt.passed });
    }
    count++;
    passed += Number(attempt.passed);
    totalPercentage += attempt.percentage;
    distribution[Math.min(9, Math.floor(attempt.percentage / 10))]++;
    if (place !== 'longread' && attempt.completedAt && attempt.completedAt >= attempt.startedAt) {
      timed++;
      seconds += (attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 1000;
    }
    addScore(dates, date, date, attempt.percentage);
    addScore(departments, department?.id ?? '', department?.name ?? '', attempt.percentage);
    addScore(employees, attempt.userId, name, attempt.percentage);
  }

  const answers = selectedAttemptIds.length ? await loadAnswers(selectedAttemptIds) : [];
  for (const answer of answers) {
    const snapshot = answer.frozenQuestion === null ? null : analyticsAnswerSnapshot.safeParse(answer.frozenQuestion);
    const question = snapshot?.success ? snapshot.data.question : legacy.get(answer.questionId);
    const stats = questions.get(answer.questionId) ?? { text: question?.title || question?.text || null, total: 0, correct: 0, wrong: new Map() };
    stats.total += answer.count;
    stats.correct += answer.isCorrect ? answer.count : 0;
    const selected = Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds : [answer.selectedOptionId];
    for (const option of question?.options ?? []) {
      if (option.isCorrect || !selected.includes(option.id)) continue;
      const wrong = stats.wrong.get(option.id) ?? { text: option.text, count: 0 };
      wrong.count += answer.count;
      stats.wrong.set(option.id, wrong);
    }
    questions.set(answer.questionId, stats);
  }
  const ranking = averages(employees).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const options = (values: Map<string, string>) => [...values].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    count, passed, places, distribution, rows, pageSize,
    average: count ? Math.round(totalPercentage / count) : null,
    duration: timed ? Math.round(seconds / timed) : null,
    dates: averages(dates).sort((a, b) => a.id.localeCompare(b.id)),
    departments: averages(departments),
    leaders: ranking.slice(0, 5),
    lagging: ranking.slice(-5).reverse(),
    questions: [...questions].map(([id, { text, total, correct, wrong }]) => ({
      id, text, total, correct,
      trap: [...wrong].sort(([a, left], [b, right]) => right.count - left.count || a.localeCompare(b))[0]?.[1] ?? null,
    })),
    filters: { departments: options(departmentOptions), groups: options(groupOptions), employees: options(employeeOptions) },
  };
}

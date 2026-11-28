import type { EffectiveAssessmentResult } from '@lms/shared/assessment-policy';
import { assessmentAttemptOrder, completedAssessmentAttempts, effectiveAssessmentResult, readAssessmentPolicy } from '../../common/assessment-policy.js';
import { questionDefinitionSchema } from '@lms/shared/assessment-question-types';
import { frozenAnswerQuestionSchema, longreadResultMetadataSchema } from '../../common/assessment-frozen.js';
import { publicQuestionDefinition } from '../../common/assessment-question-definition.js';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import type { UserRole } from '../auth/public.js';
import { isOrgWideGrant } from '../auth/public.js';
import { assessmentAnalyticsCards, assessmentAnalyticsPeriod, assessmentAnalyticsSelect, summarizeAssessment, type AssessmentAnalyticsAnswer, type AssessmentAnalyticsQuery } from './assessment-analytics.js';
import { attemptScope } from './attempt-scope.js';
import { ManagerTeamScope, isManagerTeamScoped, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

const privilegedResultRoles: UserRole[] = ['admin', 'manager', 'instructor'];

const attemptResultSummarySelect = {
  longreadRevisionId: true,
  longreadMetadata: true,
  id: true,
  organizationId: true,
  assessmentId: true,
  placementId: true,
  courseId: true,
  userId: true,
  status: true,
  score: true,
  maxScore: true,
  percentage: true,
  passed: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assessment: {
    select: {
      id: true,
      title: true,
      slug: true,
      mode: true,
      passingScore: true,
      passMessage: true,
      failMessage: true,
      presentation: true,
      showCorrectAnswers: true,
      policy: true,
      maxAttempts: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} as const satisfies Prisma.AssessmentAttemptSelect;

const attemptResultDetailSelect = {
  ...attemptResultSummarySelect,
  answers: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      questionId: true,
      selectedOptionId: true,
      selectedOptionIds: true,
      frozenQuestion: true,
      response: true,
      reviewPending: true,
      reviewComment: true,
      isCorrect: true,
      score: true,
      createdAt: true,
      updatedAt: true,
      question: {
        select: {
          id: true,
          title: true,
          type: true,
          definition: true,
          correctFeedback: true,
          incorrectFeedback: true,
          points: true,
          order: true,
          options: {
            where: { deletedAt: null, isCorrect: true },
            select: { id: true, text: true, imageUrl: true, material: true },
          },
        },
      },
      selectedOption: {
        select: {
          id: true,
          text: true,
          imageUrl: true, material: true,
        },
      },
    },
  },
} as const satisfies Prisma.AssessmentAttemptSelect;

type AttemptResultInput = {
  id: string;
  longreadMetadata?: unknown;
  longreadRevisionId?: string | null;
  organizationId: string;
  assessmentId: string;
  placementId: string | null;
  courseId: string | null;
  userId: string;
  status: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assessment: {
    id: string;
    title: string;
    slug: string;
    mode?: 'graded' | 'survey';
    passingScore: number;
    passMessage: string | null;
    failMessage: string | null;
    presentation?: unknown;
    showCorrectAnswers: boolean;
    policy?: unknown;
    maxAttempts?: number | null;
  };
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  answers?: {
    id: string;
    questionId: string;
    selectedOptionId: string | null;
    selectedOptionIds: unknown;
    response?: unknown;
    frozenQuestion?: unknown;
    reviewPending?: boolean;
    reviewComment?: string | null;
    isCorrect: boolean;
    score: number;
    createdAt: Date;
    updatedAt: Date;
    question: {
      id: string;
      title: string;
      type: string;
      definition?: unknown;
      material?: string | null;
      correctFeedback?: string | null;
      incorrectFeedback?: string | null;
      points: number;
      order: number;
      options: { id: string; text: string | null; imageUrl: string | null; material?: string | null }[];
    };
    selectedOption: {
      id: string;
      text: string | null;
      imageUrl: string | null;
      material?: string | null;
    } | null;
  }[];
};

@Injectable()
export class AssessmentResultsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAssessmentResults(assessmentId: string, actorInput: TeamScopeActor | string, placementId?: string | null) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    await this.ensureAssessmentExists(assessmentId, organizationId);

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        placementId,
        ...(placementId === null ? { longreadRevisionId: null } : {}),
        organizationId,
        countsTowardResults: true,
        ...attemptScope(this.teamScope, actor),
        deletedAt: null,
      },
      orderBy: assessmentAttemptOrder,
      select: attemptResultSummarySelect,
    });

    const groups = new Map<string, typeof attempts>();
    const key = (attempt: typeof attempts[number]) => `${attempt.userId}:${attempt.placementId ?? ''}`;
    for (const attempt of attempts) {
      if (attempt.longreadRevisionId || attempt.status !== 'completed' || !readAssessmentPolicy(attempt.assessment.policy).attemptPolicy) continue;
      const group = groups.get(key(attempt)) ?? [];
      group.push(attempt);
      groups.set(key(attempt), group);
    }
    const effective = new Map<string, EffectiveAssessmentResult>();
    for (const [groupKey, group] of groups) {
      const first = group[0];
      const policy = readAssessmentPolicy(first.assessment.policy).attemptPolicy;
      const result = policy && effectiveAssessmentResult(policy, group, first.assessment.passingScore);
      if (result) effective.set(groupKey, result);
    }
    return attempts.map((attempt) => this.toAttemptResult(attempt, attempt.longreadRevisionId ? undefined : effective.get(key(attempt))));
  }

  async getAttemptResult(attemptId: string, actorInput: TeamScopeActor | string, legacyOrganizationId?: string) {
    const actor = typeof actorInput === 'string' && legacyOrganizationId
      ? { id: actorInput, organizationId: legacyOrganizationId, roles: [] as UserRole[] }
      : normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        organizationId,
        countsTowardResults: true,
        ...attemptScope(this.teamScope, actor),
        deletedAt: null,
      },
      select: attemptResultDetailSelect,
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    await this.ensureAttemptResultAccess(attempt.userId, actor.id, organizationId, actor);

    const assessment = this.resultAssessment(attempt);
    const policy = readAssessmentPolicy(assessment.policy);
    const history = !attempt.longreadRevisionId && (policy.attemptPolicy || policy.answerVisibility === 'last')
      ? await this.prisma.assessmentAttempt.findMany({
        where: completedAssessmentAttempts({ assessmentId: attempt.assessmentId, userId: attempt.userId,
          organizationId, placementId: attempt.placementId, longreadRevisionId: null }),
        orderBy: assessmentAttemptOrder, select: { id: true, percentage: true, passed: true },
      }) : [];
    const effective = policy.attemptPolicy ? effectiveAssessmentResult(policy.attemptPolicy, history, assessment.passingScore) : undefined;
    return this.toAttemptResult(attempt, effective, history.length);
  }

  async getAnalyticsLayout({ id, organizationId }: TeamScopeActor) {
    const layout = await this.prisma.assessmentAnalyticsLayout.findUnique({
      where: { organizationId_userId: { organizationId, userId: id } },
      select: { cards: true },
    });
    return { cards: assessmentAnalyticsCards.safeParse(layout?.cards).data ?? [] };
  }

  async saveAnalyticsLayout({ id, organizationId }: TeamScopeActor, input: unknown) {
    const cards = assessmentAnalyticsCards.parse(input);
    await this.prisma.assessmentAnalyticsLayout.upsert({
      where: { organizationId_userId: { organizationId, userId: id } },
      create: { organizationId, userId: id, cards },
      update: { cards },
    });
    return { cards };
  }

  async getAssessmentAnalytics(assessmentId: string, actor: TeamScopeActor, query: AssessmentAnalyticsQuery, exportView?: 'results' | 'questions' | 'folder') {
    const { organizationId } = actor;
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    const [attempts, legacyQuestions] = await Promise.all([
      this.prisma.assessmentAttempt.findMany({
        where: {
          assessmentId, organizationId, status: 'completed', countsTowardResults: true, deletedAt: null,
          ...attemptScope(this.teamScope, actor),
          ...assessmentAnalyticsPeriod(query),
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        select: {
          ...assessmentAnalyticsSelect,
          user: { select: {
            ...assessmentAnalyticsSelect.user.select,
            groupMemberships: {
              ...assessmentAnalyticsSelect.user.select.groupMemberships,
              where: { organizationId, deletedAt: null, group: { deletedAt: null, ...this.teamScope.group(actor) } },
            },
          } },
        },
      }),
      exportView && exportView !== 'questions' ? [] : this.prisma.assessmentQuestion.findMany({
        where: { assessmentId, organizationId },
        select: { id: true, title: true, text: true, options: { select: { id: true, text: true, isCorrect: true } } },
      }),
    ]);
    const summary = await summarizeAssessment(attempts, legacyQuestions, query, (attemptIds) => exportView && exportView !== 'questions' ? Promise.resolve([]) :
      // Use the filtered and authorized attempt IDs. Aggregate repeated answers before transferring snapshots.
      this.prisma.$queryRaw<AssessmentAnalyticsAnswer[]>`
        SELECT answer.question_id AS "questionId", answer.is_correct AS "isCorrect",
          answer.selected_option_id AS "selectedOptionId", answer.selected_option_ids AS "selectedOptionIds",
          answer.frozen_question AS "frozenQuestion", COUNT(*)::integer AS count
        FROM unnest(string_to_array(${attemptIds.join(',')}, ',')::uuid[]) WITH ORDINALITY AS attempt(id, position)
        JOIN assessment_attempt_answers AS answer ON answer.attempt_id = attempt.id
        WHERE answer.organization_id = ${organizationId}::uuid AND answer.deleted_at IS NULL
        GROUP BY answer.question_id, answer.is_correct, answer.selected_option_id, answer.selected_option_ids, answer.frozen_question
        ORDER BY MIN(attempt.position), answer.question_id
      `, Boolean(exportView));
    return { title: assessment.title, folderId: assessment.folderId, ...summary };
  }

  async getAssessmentReport(assessmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        status: 'completed',
        countsTowardResults: true,
        ...attemptScope(this.teamScope, actor),
        deletedAt: null,
      },
      select: {
        id: true,
        score: true,
        maxScore: true,
        percentage: true,
        passed: true,
        completedAt: true,
        longreadMetadata: true,
      },
    });

    const versionGroups = new Map<string, { lessonId: string; version: number; attemptsCount: number; passedCount: number; percentages: number[] }>();
    for (const attempt of attempts) {
      const parsed = longreadResultMetadataSchema.safeParse(attempt.longreadMetadata);
      if (!parsed.success) continue;
      const key = `${parsed.data.lessonId}:${parsed.data.version}`, group = versionGroups.get(key) ?? { lessonId: parsed.data.lessonId, version: parsed.data.version, attemptsCount: 0, passedCount: 0, percentages: [] };
      group.attemptsCount++; group.passedCount += Number(attempt.passed); group.percentages.push(attempt.percentage); versionGroups.set(key, group);
    }
    const attemptsCount = attempts.length;
    const passedCount = attempts.filter((attempt) => attempt.passed).length;
    const failedCount = attemptsCount - passedCount;
    const averagePercentage =
      attemptsCount > 0 ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.percentage, 0) / attemptsCount) : 0;
    const highestPercentage = attemptsCount > 0 ? Math.max(...attempts.map((attempt) => attempt.percentage)) : 0;
    const lowestPercentage = attemptsCount > 0 ? Math.min(...attempts.map((attempt) => attempt.percentage)) : 0;

    return {
      assessmentId,
      organizationId,
      title: assessment.title,
      passingScore: assessment.passingScore,
      attemptsCount,
      passedCount,
      failedCount,
      averagePercentage,
      highestPercentage,
      lowestPercentage,
      ...(versionGroups.size ? { versions: [...versionGroups.values()].map(({ percentages, ...group }) => ({ ...group, averagePercentage: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) })) } : {}),
    };
  }

  private async ensureAssessmentExists(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        folderId: true,
        passingScore: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  private async ensureAttemptResultAccess(attemptUserId: string, currentUserId: string, organizationId: string, actor: TeamScopeActor) {
    if (attemptUserId === currentUserId) {
      return;
    }
    if (isManagerTeamScoped(actor) || isOrgWideGrant(actor)) return;

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: currentUserId,
        organizationId,
        role: { in: privilegedResultRoles },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Assessment attempt result is not available for current user');
    }
  }

  private resultAssessment(attempt: AttemptResultInput) {
    const frozen = frozenAnswerQuestionSchema.safeParse(attempt.answers?.[0]?.frozenQuestion);
    if (!frozen.success || 'blockId' in frozen.data) return attempt.assessment;
    return { ...attempt.assessment, ...frozen.data.question.assessment, ...frozen.data.resultSettings };
  }

  private toAttemptResult(attempt: AttemptResultInput, effectiveResult?: EffectiveAssessmentResult, attemptsUsed = 0) {
    const context = longreadResultMetadataSchema.safeParse(attempt.longreadMetadata);
    const assessment = this.resultAssessment(attempt);
    const policy = context.success || attempt.longreadRevisionId ? {} : readAssessmentPolicy(assessment.policy);
    const visibility = policy.answerVisibility ?? (assessment.showCorrectAnswers ? 'submitted' : 'never');
    const revealAll = visibility === 'submitted' || (visibility === 'last' && !!assessment.maxAttempts && attemptsUsed >= assessment.maxAttempts);
    return {
      id: attempt.id,
      ...(effectiveResult ? { effectiveResult } : {}),
      organizationId: attempt.organizationId,
      assessmentId: attempt.assessmentId,
      placementId: attempt.placementId,
      courseId: attempt.courseId,
      userId: attempt.userId,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      assessment: context.success ? { ...attempt.assessment, title: context.data.title, passingScore: context.data.passingScore } : assessment,
      ...(context.success ? { longread: { lessonId: context.data.lessonId, version: context.data.version } } : {}),
      user: attempt.user,
      answers:
        attempt.answers?.map((answer) => {
          const snapshot = frozenAnswerQuestionSchema.safeParse(answer.frozenQuestion);
          const frozen = snapshot.success && context.success === ('blockId' in snapshot.data) ? snapshot.data : null;
          const question = frozen ? frozen.question : answer.question;
          const reveal = attempt.status === 'completed' && (context.success ? frozen && frozen.revealAnswers : revealAll || (!answer.isCorrect && policy.incorrectAnswer === 'review'));
          const correctOptions = frozen ? frozen.question.options.filter((option) => option.isCorrect).map(({ id, text, imageUrl, material }) => ({ id, text, imageUrl, material })) : answer.question.options;
          const definition = questionDefinitionSchema.safeParse(question.definition);
          const selected = frozen ? frozen.question.options.find((option) => option.id === answer.selectedOptionId) : null;
          const feedbackKey = answer.isCorrect ? 'correctFeedback' : 'incorrectFeedback';
          const feedback = question[feedbackKey] === undefined ? answer.question[feedbackKey] : question[feedbackKey];
          return {
            id: answer.id, questionId: answer.questionId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: answer.selectedOptionIds,
            ...(answer.response ? { response: answer.response } : {}), isCorrect: answer.isCorrect, score: answer.score,
            ...(answer.reviewPending ? { reviewPending: true } : {}), ...(answer.reviewComment ? { reviewComment: answer.reviewComment } : {}), createdAt: answer.createdAt, updatedAt: answer.updatedAt,
            question: { id: question.id, title: question.title, type: question.type, points: question.points, material: question.material, order: question.order,
              ...(frozen ? { options: frozen.question.options.map(({ id, text, imageUrl, material }) => ({ id, text, imageUrl, material })) } : {}),
              ...(definition.success && definition.data.type === question.type ? { definition: publicQuestionDefinition(definition.data, `result:${answer.id}`) } : {}) },
            ...(attempt.status === 'completed' && policy.showFeedback ? { feedback } : {}),
            selectedOption: frozen ? selected ? { id: selected.id, text: selected.text, imageUrl: selected.imageUrl, material: selected.material } : null : answer.selectedOption,
            ...(reveal && question.definition && !(definition.success && definition.data.type === 'short_answer' && definition.data.manualReview) ? { correctDefinition: question.definition } : {}),
            correctOptions: reveal ? correctOptions : undefined,
          };
        }) ?? [],
    };
  }
}

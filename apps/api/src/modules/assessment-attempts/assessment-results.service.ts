import { frozenAnswerQuestionSchema, longreadResultMetadataSchema } from '../../common/assessment-frozen.js';
import { publicQuestionDefinition } from '../../common/assessment-question-definition.js';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import type { UserRole } from '../auth/public.js';
import { ManagerTeamScope, isManagerTeamScoped, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

const privilegedResultRoles: UserRole[] = ['admin', 'manager', 'instructor'];

const attemptResultSummarySelect = {
  longreadMetadata: true,
  id: true,
  organizationId: true,
  assessmentId: true,
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
      passingScore: true,
      passMessage: true,
      failMessage: true,
      showCorrectAnswers: true,
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
          points: true,
          order: true,
          options: {
            where: { deletedAt: null, isCorrect: true },
            select: { id: true, text: true, imageUrl: true },
          },
        },
      },
      selectedOption: {
        select: {
          id: true,
          text: true,
          imageUrl: true,
        },
      },
    },
  },
} as const satisfies Prisma.AssessmentAttemptSelect;

type AttemptResultInput = {
  id: string;
  longreadMetadata?: unknown;
  organizationId: string;
  assessmentId: string;
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
    passingScore: number;
    passMessage: string | null;
    failMessage: string | null;
    showCorrectAnswers: boolean;
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
    isCorrect: boolean;
    score: number;
    createdAt: Date;
    updatedAt: Date;
    question: {
      id: string;
      title: string;
      type: string;
      definition?: unknown;
      points: number;
      order: number;
      options: { id: string; text: string | null; imageUrl: string | null }[];
    };
    selectedOption: {
      id: string;
      text: string | null;
      imageUrl: string | null;
    } | null;
  }[];
};

@Injectable()
export class AssessmentResultsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAssessmentResults(assessmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    await this.ensureAssessmentExists(assessmentId, organizationId);

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        countsTowardResults: true,
        ...this.teamScope.userOwnedResource(actor),
        deletedAt: null,
      },
      orderBy: { completedAt: 'desc' },
      select: attemptResultSummarySelect,
    });

    return attempts.map((attempt) => this.toAttemptResult(attempt));
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
        ...this.teamScope.userOwnedResource(actor),
        deletedAt: null,
      },
      select: attemptResultDetailSelect,
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    await this.ensureAttemptResultAccess(attempt.userId, actor.id, organizationId, actor);

    return this.toAttemptResult(attempt);
  }

  async getAssessmentReport(assessmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        countsTowardResults: true,
        ...this.teamScope.userOwnedResource(actor),
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
    if (isManagerTeamScoped(actor)) return;

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

  private toAttemptResult(attempt: AttemptResultInput) {
    const context = longreadResultMetadataSchema.safeParse(attempt.longreadMetadata);
    return {
      id: attempt.id,
      organizationId: attempt.organizationId,
      assessmentId: attempt.assessmentId,
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
      assessment: context.success ? { ...attempt.assessment, title: context.data.title, passingScore: context.data.passingScore } : attempt.assessment,
      ...(context.success ? { longread: { lessonId: context.data.lessonId, version: context.data.version } } : {}),
      user: attempt.user,
      answers:
        attempt.answers?.map((answer) => {
          const frozen = frozenAnswerQuestionSchema.safeParse(answer.frozenQuestion);
          const question = frozen.success ? frozen.data.question : answer.question;
          const reveal = attempt.status === 'completed' && (context.success ? frozen.success && frozen.data.revealAnswers : attempt.assessment.showCorrectAnswers);
          const correctOptions = frozen.success ? frozen.data.question.options.filter((option) => option.isCorrect).map(({ id, text, imageUrl }) => ({ id, text, imageUrl })) : answer.question.options;
          const selected = frozen.success ? frozen.data.question.options.find((option) => option.id === answer.selectedOptionId) : null;
          return {
            id: answer.id, questionId: answer.questionId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: answer.selectedOptionIds,
            ...(answer.response ? { response: answer.response } : {}), isCorrect: answer.isCorrect, score: answer.score, createdAt: answer.createdAt, updatedAt: answer.updatedAt,
            question: { id: question.id, title: question.title, type: question.type, points: question.points, order: question.order,
              ...(frozen.success ? { options: frozen.data.question.options.map(({ id, text, imageUrl }) => ({ id, text, imageUrl })),
                ...(frozen.data.question.definition ? { definition: publicQuestionDefinition(frozen.data.question.definition, `result:${answer.id}`) } : {}) } : {}) },
            selectedOption: frozen.success ? selected ? { id: selected.id, text: selected.text, imageUrl: selected.imageUrl } : null : answer.selectedOption,
            ...(reveal && question.definition ? { correctDefinition: question.definition } : {}),
            correctOptions: reveal ? correctOptions : undefined,
          };
        }) ?? [],
    };
  }
}

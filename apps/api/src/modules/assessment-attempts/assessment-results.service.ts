import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import type { UserRole } from '../auth/public.js';
import { ManagerTeamScope, isManagerTeamScoped, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

const privilegedResultRoles: UserRole[] = ['admin', 'manager', 'instructor'];

const attemptResultSummarySelect = {
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
      isCorrect: true,
      score: true,
      createdAt: true,
      updatedAt: true,
      question: {
        select: {
          id: true,
          title: true,
          type: true,
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
    isCorrect: boolean;
    score: number;
    createdAt: Date;
    updatedAt: Date;
    question: {
      id: string;
      title: string;
      type: string;
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
      },
    });

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
      assessment: attempt.assessment,
      user: attempt.user,
      answers:
        attempt.answers?.map((answer) => ({
          id: answer.id,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          selectedOptionIds: answer.selectedOptionIds,
          isCorrect: answer.isCorrect,
          score: answer.score,
          createdAt: answer.createdAt,
          updatedAt: answer.updatedAt,
          question: {
            id: answer.question.id,
            title: answer.question.title,
            type: answer.question.type,
            points: answer.question.points,
            order: answer.question.order,
          },
          selectedOption: answer.selectedOption,
          // Only exposed when the assessment author opted in — otherwise a learner could infer
          // the correct answer from the API response even with the UI hiding it.
          correctOptions: attempt.assessment.showCorrectAnswers ? answer.question.options : undefined,
        })) ?? [],
    };
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

const privilegedResultRoles = ['admin', 'manager', 'instructor'] as const;

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
  constructor(private readonly prisma: PrismaService) {}

  async listAssessmentResults(assessmentId: string, organizationId: string) {
    await this.ensureAssessmentExists(assessmentId, organizationId);

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { completedAt: 'desc' },
      select: this.getAttemptResultSelect(false),
    });

    return attempts.map((attempt) => this.toAttemptResult(attempt));
  }

  async getAttemptResult(attemptId: string, currentUserId: string, organizationId: string) {
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        organizationId,
        deletedAt: null,
      },
      select: this.getAttemptResultSelect(true),
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    await this.ensureAttemptResultAccess(attempt.userId, currentUserId, organizationId);

    return this.toAttemptResult(attempt);
  }

  async getAssessmentReport(assessmentId: string, organizationId: string) {
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
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

  private async ensureAttemptResultAccess(attemptUserId: string, currentUserId: string, organizationId: string) {
    if (attemptUserId === currentUserId) {
      return;
    }

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

  private getAttemptResultSelect(includeAnswers: boolean) {
    return {
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
      ...(includeAnswers
        ? {
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
          }
        : {}),
    } as const;
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
          question: answer.question,
          selectedOption: answer.selectedOption,
        })) ?? [],
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateAssessmentAttemptAnswerInput,
  CreateAssessmentAttemptInput,
} from './assessment-attempts.schemas.js';

const attemptSelect = {
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
} as const;

const attemptAnswerSelect = {
  id: true,
  organizationId: true,
  attemptId: true,
  questionId: true,
  selectedOptionId: true,
  selectedOptionIds: true,
  isCorrect: true,
  score: true,
  createdAt: true,
  updatedAt: true,
} as const;

type QuestionWithOptions = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  points: number;
  options: {
    id: string;
    isCorrect: boolean;
  }[];
};

type GradedAnswer = {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  isCorrect: boolean;
  score: number;
};

@Injectable()
export class AssessmentAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAttempts(assessmentId: string, organizationId: string) {
    await this.ensureAssessmentExists(assessmentId, organizationId);

    return this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: attemptSelect,
    });
  }

  async getAttempt(attemptId: string, organizationId: string) {
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        organizationId,
        deletedAt: null,
      },
      select: {
        ...attemptSelect,
        answers: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: attemptAnswerSelect,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    return attempt;
  }

  async createAttempt(assessmentId: string, userId: string, organizationId: string, input: CreateAssessmentAttemptInput) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        courseId: true,
        status: true,
        passingScore: true,
        maxAttempts: true,
        availableAfterCourseCompletion: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status !== 'published') {
      throw new BadRequestException('Assessment must be published before attempting');
    }

    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(assessment.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);
    await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts);

    const questions = await this.getQuestions(assessmentId, organizationId);
    const gradedAnswers = this.gradeAnswers(questions, input.answers);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const passed = percentage >= assessment.passingScore;
    const completedAt = new Date();

    const attemptId = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.assessmentAttempt.create({
        data: {
          organizationId,
          assessmentId,
          userId,
          status: 'completed',
          score,
          maxScore,
          percentage,
          passed,
          completedAt,
        },
        select: { id: true },
      });

      await tx.assessmentAttemptAnswer.createMany({
        data: gradedAnswers.map((answer) => ({
          organizationId,
          attemptId: attempt.id,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          selectedOptionIds: answer.selectedOptionIds ?? undefined,
          isCorrect: answer.isCorrect,
          score: answer.score,
        })),
      });

      if (passed) {
        await tx.certificate.upsert({
          where: {
            organizationId_courseId_userId: {
              organizationId,
              courseId: assessment.courseId,
              userId,
            },
          },
          update: {
            assessmentAttemptId: attempt.id,
            status: 'issued',
            revokedAt: null,
          },
          create: {
            organizationId,
            courseId: assessment.courseId,
            userId,
            assessmentAttemptId: attempt.id,
          },
        });
      }

      return attempt.id;
    });

    return this.getAttempt(attemptId, organizationId);
  }

  private async ensureAssessmentExists(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureAssessmentIsAvailable(courseId: string, userId: string, organizationId: string, availableAfterCourseCompletion: boolean) {
    if (!availableAfterCourseCompletion) {
      return;
    }

    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({
        where: {
          courseId,
          organizationId,
          deletedAt: null,
          status: 'published',
        },
      }),
      this.prisma.progress.count({
        where: {
          courseId,
          userId,
          organizationId,
          deletedAt: null,
          status: 'completed',
          lessonId: { not: null },
          lesson: {
            status: 'published',
            deletedAt: null,
          },
        },
      }),
    ]);

    if (totalLessons === 0 || completedLessons < totalLessons) {
      throw new BadRequestException('Course must be completed before assessment attempt');
    }
  }

  private async ensureAttemptsLimit(assessmentId: string, userId: string, organizationId: string, maxAttempts: number | null) {
    if (!maxAttempts) {
      return;
    }

    const attemptsCount = await this.prisma.assessmentAttempt.count({
      where: {
        assessmentId,
        userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (attemptsCount >= maxAttempts) {
      throw new BadRequestException('Assessment attempts limit reached');
    }
  }

  private async getQuestions(assessmentId: string, organizationId: string): Promise<QuestionWithOptions[]> {
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        points: true,
        options: {
          where: { deletedAt: null },
          select: {
            id: true,
            isCorrect: true,
          },
        },
      },
    });

    if (!questions.length) {
      throw new BadRequestException('Assessment has no questions');
    }

    return questions;
  }

  private gradeAnswers(questions: QuestionWithOptions[], answers: CreateAssessmentAttemptAnswerInput[]) {
    const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

    if (answerByQuestionId.size !== answers.length) {
      throw new BadRequestException('Duplicate question answers are not allowed');
    }

    return questions.map((question) => {
      const answer = answerByQuestionId.get(question.id);

      if (!answer) {
        throw new BadRequestException('All assessment questions must be answered');
      }

      return this.gradeAnswer(question, answer);
    });
  }

  private gradeAnswer(question: QuestionWithOptions, answer: CreateAssessmentAttemptAnswerInput): GradedAnswer {
    const optionIds = new Set(question.options.map((option) => option.id));
    const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);

    if (question.type === 'multiple_choice') {
      return this.gradeMultipleChoiceAnswer(question, answer, optionIds, correctOptionIds);
    }

    return this.gradeSingleChoiceAnswer(question, answer, optionIds, correctOptionIds);
  }

  private gradeSingleChoiceAnswer(
    question: QuestionWithOptions,
    answer: CreateAssessmentAttemptAnswerInput,
    optionIds: Set<string>,
    correctOptionIds: string[],
  ): GradedAnswer {
    if (!answer.selectedOptionId || answer.selectedOptionIds) {
      throw new BadRequestException('Single choice answer requires selectedOptionId');
    }

    if (!optionIds.has(answer.selectedOptionId)) {
      throw new BadRequestException('Selected option does not belong to question');
    }

    const isCorrect = correctOptionIds.length === 1 && correctOptionIds[0] === answer.selectedOptionId;

    return {
      questionId: question.id,
      selectedOptionId: answer.selectedOptionId,
      isCorrect,
      score: isCorrect ? question.points : 0,
    };
  }

  private gradeMultipleChoiceAnswer(
    question: QuestionWithOptions,
    answer: CreateAssessmentAttemptAnswerInput,
    optionIds: Set<string>,
    correctOptionIds: string[],
  ): GradedAnswer {
    if (!answer.selectedOptionIds || answer.selectedOptionId) {
      throw new BadRequestException('Multiple choice answer requires selectedOptionIds');
    }

    const selectedOptionIds = [...new Set(answer.selectedOptionIds)];

    if (selectedOptionIds.length !== answer.selectedOptionIds.length) {
      throw new BadRequestException('Duplicate selected options are not allowed');
    }

    if (selectedOptionIds.some((optionId) => !optionIds.has(optionId))) {
      throw new BadRequestException('Selected option does not belong to question');
    }

    const selected = selectedOptionIds.sort();
    const correct = [...correctOptionIds].sort();
    const isCorrect = selected.length === correct.length && selected.every((optionId, index) => optionId === correct[index]);

    return {
      questionId: question.id,
      selectedOptionIds,
      isCorrect,
      score: isCorrect ? question.points : 0,
    };
  }
}

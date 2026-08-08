import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ManagerTeamScope, TeamScopeActor, normalizeActor } from '../manager-team-scope/manager-team-scope.js';
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
  scoringMode: 'all_or_nothing' | 'proportional' | 'proportional_with_penalty' | 'per_option';
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
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAttempts(assessmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    await this.ensureAssessmentExists(assessmentId, organizationId);

    return this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        ...this.teamScope.userOwnedResource(actor),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: attemptSelect,
    });
  }

  async getAttempt(attemptId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        organizationId,
        ...this.teamScope.userOwnedResource(actor),
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

  /**
   * Untimed assessments (timeLimitMinutes null — the common case, unchanged): grade and create the
   * completed attempt in one call, exactly as before startAttempt existed.
   *
   * Timed assessments: requires an existing in_progress attempt from startAttempt. Late submission
   * (now - startedAt > timeLimitMinutes) still grades and records the answers, but forces
   * passed: false regardless of score — the attempt is spent, not silently rejected.
   */
  async createAttempt(assessmentId: string, userId: string, organizationId: string, input: CreateAssessmentAttemptInput) {
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);

    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(assessment.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    const inProgress = assessment.timeLimitMinutes
      ? await this.prisma.assessmentAttempt.findFirst({
          where: { assessmentId, userId, organizationId, status: 'in_progress', deletedAt: null },
          select: { id: true, startedAt: true },
        })
      : null;

    if (assessment.timeLimitMinutes && !inProgress) {
      throw new BadRequestException('Attempt was not started — call the start endpoint first');
    }

    if (!inProgress) {
      await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts);
    }

    const questions = await this.getQuestions(assessmentId, organizationId);
    const gradedAnswers = this.gradeAnswers(questions, input.answers);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const expired = Boolean(
      inProgress && assessment.timeLimitMinutes && Date.now() - inProgress.startedAt.getTime() > assessment.timeLimitMinutes * 60_000,
    );
    const passed = expired ? false : percentage >= assessment.passingScore;
    const completedAt = new Date();

    const attemptId = await this.prisma.$transaction(async (tx) => {
      const attemptData = { score, maxScore, percentage, passed, completedAt, status: 'completed' as const };
      const attempt = inProgress
        ? await tx.assessmentAttempt.update({ where: { id: inProgress.id, organizationId }, data: attemptData, select: { id: true } })
        : await tx.assessmentAttempt.create({ data: { organizationId, assessmentId, userId, ...attemptData }, select: { id: true } });

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

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
  }

  /**
   * Records the server-trusted start time for a timed assessment. Idempotent — resuming just
   * returns the existing in_progress attempt rather than restarting the clock. Untimed assessments
   * (the default) don't use this at all; submit directly via createAttempt.
   */
  async startAttempt(assessmentId: string, userId: string, organizationId: string) {
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);

    if (!assessment.timeLimitMinutes) {
      throw new BadRequestException('This assessment has no time limit — submit answers directly');
    }

    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(assessment.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    const existing = await this.prisma.assessmentAttempt.findFirst({
      where: { assessmentId, userId, organizationId, status: 'in_progress', deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      return this.getAttempt(existing.id, { id: userId, organizationId, roles: ['learner'] });
    }

    await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts);

    const attempt = await this.prisma.assessmentAttempt.create({
      data: { organizationId, assessmentId, userId, status: 'in_progress', startedAt: new Date() },
      select: { id: true },
    });

    return this.getAttempt(attempt.id, { id: userId, organizationId, roles: ['learner'] });
  }

  private async loadAssessmentForAttempt(assessmentId: string, organizationId: string) {
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
        timeLimitMinutes: true,
        availableAfterCourseCompletion: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status !== 'published') {
      throw new BadRequestException('Assessment must be published before attempting');
    }

    return assessment;
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
        scoringMode: true,
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
    const isFullMatch = selected.length === correct.length && selected.every((optionId, index) => optionId === correct[index]);
    const score = this.scoreMultipleChoiceAnswer(question, new Set(selectedOptionIds), new Set(correctOptionIds), isFullMatch);

    return {
      questionId: question.id,
      selectedOptionIds,
      isCorrect: isFullMatch,
      score,
    };
  }

  /**
   * `isCorrect` always means an exact match with the correct set — score is what varies by
   * scoringMode. all_or_nothing is the only mode where a non-exact selection scores 0; the other
   * three award partial credit for a partially-correct multiple_choice selection.
   */
  private scoreMultipleChoiceAnswer(
    question: QuestionWithOptions,
    selectedSet: Set<string>,
    correctSet: Set<string>,
    isFullMatch: boolean,
  ): number {
    const correctCount = correctSet.size;

    switch (question.scoringMode) {
      case 'all_or_nothing':
        return isFullMatch ? question.points : 0;

      case 'proportional': {
        if (correctCount === 0) return 0;
        const correctSelectedCount = [...selectedSet].filter((optionId) => correctSet.has(optionId)).length;
        return Math.round((correctSelectedCount / correctCount) * question.points);
      }

      case 'proportional_with_penalty': {
        if (correctCount === 0) return 0;
        const correctSelectedCount = [...selectedSet].filter((optionId) => correctSet.has(optionId)).length;
        const incorrectSelectedCount = selectedSet.size - correctSelectedCount;
        const ratio = Math.max(0, (correctSelectedCount - incorrectSelectedCount) / correctCount);
        return Math.round(ratio * question.points);
      }

      case 'per_option': {
        const totalOptions = question.options.length;
        if (totalOptions === 0) return 0;
        const correctJudgments = question.options.filter(
          (option) => selectedSet.has(option.id) === option.isCorrect,
        ).length;
        return Math.round((correctJudgments / totalOptions) * question.points);
      }
    }
  }
}

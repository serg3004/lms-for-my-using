import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateAssessmentAttemptAnswerInput, CreateAssessmentAttemptInput } from './assessment-attempts.schemas.js';

type AttemptRow = {
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
};

type QuestionWithOptions = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  points: number;
  options: { id: string; isCorrect: boolean }[];
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

    return this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, organization_id AS "organizationId", assessment_id AS "assessmentId", user_id AS "userId",
        status::text, score, max_score AS "maxScore", percentage, passed, started_at AS "startedAt",
        completed_at AS "completedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM assessment_attempts
      WHERE assessment_id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
  }

  async getAttempt(attemptId: string, organizationId: string) {
    const attempts = await this.prisma.$queryRaw<AttemptRow[]>`
      SELECT id, organization_id AS "organizationId", assessment_id AS "assessmentId", user_id AS "userId",
        status::text, score, max_score AS "maxScore", percentage, passed, started_at AS "startedAt",
        completed_at AS "completedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM assessment_attempts
      WHERE id = ${attemptId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    const attempt = attempts[0];

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    const answers = await this.prisma.$queryRaw`
      SELECT id, organization_id AS "organizationId", attempt_id AS "attemptId", question_id AS "questionId",
        selected_option_id AS "selectedOptionId", selected_option_ids AS "selectedOptionIds",
        is_correct AS "isCorrect", score, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM assessment_attempt_answers
      WHERE attempt_id = ${attempt.id}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;

    return { ...attempt, answers };
  }

  async createAttempt(assessmentId: string, userId: string, organizationId: string, input: CreateAssessmentAttemptInput) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { id: true, passingScore: true, maxAttempts: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    await this.ensureUserExists(userId, organizationId);
    await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts);

    const questions = await this.getQuestions(assessmentId, organizationId);
    const gradedAnswers = this.gradeAnswers(questions, input.answers);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const passed = percentage >= assessment.passingScore;
    const completedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO assessment_attempts (
          organization_id, assessment_id, user_id, status, score, max_score, percentage, passed, completed_at, updated_at
        )
        VALUES (
          ${organizationId}::uuid, ${assessmentId}::uuid, ${userId}::uuid, 'completed',
          ${score}, ${maxScore}, ${percentage}, ${passed}, ${completedAt}, CURRENT_TIMESTAMP
        )
        RETURNING id
      `;
      const attemptId = attempts[0]?.id;

      if (!attemptId) {
        throw new BadRequestException('Assessment attempt was not created');
      }

      for (const answer of gradedAnswers) {
        await tx.$executeRaw`
          INSERT INTO assessment_attempt_answers (
            organization_id, attempt_id, question_id, selected_option_id, selected_option_ids, is_correct, score, updated_at
          )
          VALUES (
            ${organizationId}::uuid, ${attemptId}::uuid, ${answer.questionId}::uuid,
            ${answer.selectedOptionId ?? null}::uuid,
            ${answer.selectedOptionIds ? JSON.stringify(answer.selectedOptionIds) : null}::jsonb,
            ${answer.isCorrect}, ${answer.score}, CURRENT_TIMESTAMP
          )
        `;
      }

      return this.getAttempt(attemptId, organizationId);
    });
  }

  private async ensureAssessmentExists(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureAttemptsLimit(assessmentId: string, userId: string, organizationId: string, maxAttempts: number | null) {
    if (!maxAttempts) {
      return;
    }

    const attempts = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM assessment_attempts
      WHERE assessment_id = ${assessmentId}::uuid AND user_id = ${userId}::uuid
        AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
    `;

    if (Number(attempts[0]?.count ?? 0) >= maxAttempts) {
      throw new BadRequestException('Assessment attempts limit reached');
    }
  }

  private async getQuestions(assessmentId: string, organizationId: string): Promise<QuestionWithOptions[]> {
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId, organizationId, deletedAt: null },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        points: true,
        options: {
          where: { deletedAt: null },
          select: { id: true, isCorrect: true },
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

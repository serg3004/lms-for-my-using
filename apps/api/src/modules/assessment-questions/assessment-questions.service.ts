import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { seededShuffle } from '../../common/seeded-shuffle.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateAssessmentAnswerOptionInput,
  CreateAssessmentQuestionInput,
  UpdateAssessmentAnswerOptionInput,
  UpdateAssessmentQuestionInput,
} from './assessment-questions.schemas.js';

const assessmentQuestionSelect = {
  id: true,
  organizationId: true,
  assessmentId: true,
  type: true,
  title: true,
  text: true,
  imageUrl: true,
  points: true,
  order: true,
  scoringMode: true,
  createdAt: true,
  updatedAt: true,
} as const;

const assessmentAnswerOptionSelect = {
  id: true,
  organizationId: true,
  questionId: true,
  text: true,
  imageUrl: true,
  isCorrect: true,
  order: true,
  createdAt: true,
  updatedAt: true,
} as const;

const learnerQuizOptionsSelect = {
  where: { deletedAt: null },
  orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
  select: {
    id: true,
    questionId: true,
    text: true,
    imageUrl: true,
    order: true,
  },
};

const learnerAssessmentQuestionSelect = {
  id: true,
  organizationId: true,
  assessmentId: true,
  type: true,
  title: true,
  text: true,
  imageUrl: true,
  points: true,
  order: true,
  scoringMode: true,
  options: learnerQuizOptionsSelect,
} as const;

@Injectable()
export class AssessmentQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listQuestions(assessmentId: string, organizationId: string) {
    await this.ensureAssessmentExists(assessmentId, organizationId);

    return this.prisma.assessmentQuestion.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: assessmentQuestionSelect,
    });
  }

  /**
   * randomizeOrder shuffles both the question order and each question's option order, seeded by
   * assessmentId+userId(+questionId for options) so a learner sees a stable order across page
   * reloads within an attempt, while different learners see different orders (discourages sharing
   * "the answer is C" between people sitting the same test).
   */
  async listLearnerQuizQuestions(assessmentId: string, organizationId: string, userId: string) {
    const assessment = await this.ensurePublishedAssessmentExists(assessmentId, organizationId);

    const questions = await this.prisma.assessmentQuestion.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: learnerAssessmentQuestionSelect,
    });

    if (!assessment.randomizeOrder) {
      return questions;
    }

    return seededShuffle(questions, `${assessmentId}:${userId}`).map((question) => ({
      ...question,
      options: seededShuffle(question.options, `${assessmentId}:${userId}:${question.id}`),
    }));
  }

  async getQuestion(questionId: string, organizationId: string) {
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: {
        id: questionId,
        organizationId,
        deletedAt: null,
      },
      select: assessmentQuestionSelect,
    });

    if (!question) {
      throw new NotFoundException('Assessment question not found');
    }

    return question;
  }

  async createQuestion(assessmentId: string, input: CreateAssessmentQuestionInput) {
    await this.ensureAssessmentExists(assessmentId, input.organizationId);

    return this.prisma.assessmentQuestion.create({
      data: {
        ...input,
        assessmentId,
      },
      select: assessmentQuestionSelect,
    });
  }

  async updateQuestion(questionId: string, organizationId: string, input: UpdateAssessmentQuestionInput) {
    await this.ensureQuestionExists(questionId, organizationId);

    return this.prisma.assessmentQuestion.update({
      where: { id: questionId, organizationId },
      data: input,
      select: assessmentQuestionSelect,
    });
  }

  async deleteQuestion(questionId: string, organizationId: string) {
    await this.ensureQuestionExists(questionId, organizationId);

    await this.prisma.assessmentQuestion.update({
      where: { id: questionId, organizationId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  async listAnswerOptions(questionId: string, organizationId: string) {
    await this.ensureQuestionExists(questionId, organizationId);

    return this.prisma.assessmentAnswerOption.findMany({
      where: {
        questionId,
        organizationId,
        deletedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: assessmentAnswerOptionSelect,
    });
  }

  async createAnswerOption(questionId: string, input: CreateAssessmentAnswerOptionInput) {
    await this.ensureQuestionExists(questionId, input.organizationId);

    return this.prisma.assessmentAnswerOption.create({
      data: {
        ...input,
        questionId,
      },
      select: assessmentAnswerOptionSelect,
    });
  }

  async updateAnswerOption(optionId: string, organizationId: string, input: UpdateAssessmentAnswerOptionInput) {
    const option = await this.prisma.assessmentAnswerOption.findFirst({
      where: { id: optionId, organizationId, deletedAt: null },
      select: { id: true, text: true, imageUrl: true },
    });

    if (!option) {
      throw new NotFoundException('Assessment answer option not found');
    }

    const nextText = input.text !== undefined ? input.text : option.text;
    const nextImageUrl = input.imageUrl !== undefined ? input.imageUrl : option.imageUrl;

    if (!nextText && !nextImageUrl) {
      throw new BadRequestException('Answer option requires text or imageUrl');
    }

    return this.prisma.assessmentAnswerOption.update({
      where: { id: optionId, organizationId },
      data: input,
      select: assessmentAnswerOptionSelect,
    });
  }

  async deleteAnswerOption(optionId: string, organizationId: string) {
    const option = await this.prisma.assessmentAnswerOption.findFirst({
      where: { id: optionId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!option) {
      throw new NotFoundException('Assessment answer option not found');
    }

    await this.prisma.assessmentAnswerOption.update({
      where: { id: optionId, organizationId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
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

  private async ensureQuestionExists(questionId: string, organizationId: string) {
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: {
        id: questionId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!question) {
      throw new NotFoundException('Assessment question not found');
    }
  }

  private async ensurePublishedAssessmentExists(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        status: 'published',
        deletedAt: null,
      },
      select: { id: true, randomizeOrder: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }
}

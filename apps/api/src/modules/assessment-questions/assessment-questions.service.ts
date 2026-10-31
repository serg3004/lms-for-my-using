import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validateQuestionDefinition, publicQuestionDefinition } from '../../common/assessment-question-definition.js';

import { seededShuffle } from '../../common/seeded-shuffle.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
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
  definition: true,
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
  definition: true,
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
      take: LEGACY_LIST_LIMIT,
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
      take: LEGACY_LIST_LIMIT,
      select: learnerAssessmentQuestionSelect,
    });

    const publicQuestions = questions.map(({ definition, ...question }) => {
      const parsed = validateQuestionDefinition(question.type, definition);
      return { ...question, options: parsed ? [] : question.options, ...(parsed ? { definition: publicQuestionDefinition(parsed, `${assessmentId}:${userId}:${question.id}`) } : {}) };
    });
    if (!assessment.randomizeOrder) {
      return publicQuestions;
    }

    return seededShuffle(publicQuestions, `${assessmentId}:${userId}`).map((question) => ({
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

    const definition = validateQuestionDefinition(input.type, input.definition);
    return this.prisma.assessmentQuestion.create({
      data: {
        ...input,
        definition: definition ?? undefined,
        assessmentId,
      },
      select: assessmentQuestionSelect,
    });
  }

  async updateQuestion(questionId: string, organizationId: string, input: UpdateAssessmentQuestionInput) {
    const current = await this.ensureQuestionExists(questionId, organizationId);
    const definitionChanged = input.type !== undefined || input.definition !== undefined;
    const type = input.type ?? current.type;
    const definition = definitionChanged ? validateQuestionDefinition(type, input.definition !== undefined ? input.definition : current.definition) : null;
    return this.prisma.assessmentQuestion.update({
      where: { id: questionId, organizationId },
      data: { ...input, definition: definitionChanged ? definition ?? Prisma.DbNull : undefined, ...(definitionChanged ? { type } : {}) },
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
    const question = await this.ensureQuestionExists(questionId, organizationId);
    if (question.definition || ['matching', 'ordering', 'fill_blank', 'short_answer'].includes(question.type)) return [];
    return this.prisma.assessmentAnswerOption.findMany({
      where: {
        questionId,
        organizationId,
        deletedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      take: LEGACY_LIST_LIMIT,
      select: assessmentAnswerOptionSelect,
    });
  }

  async createAnswerOption(questionId: string, input: CreateAssessmentAnswerOptionInput) {
    const question = await this.ensureQuestionExists(questionId, input.organizationId);
    if (question.definition || ['matching', 'ordering', 'fill_blank', 'short_answer'].includes(question.type)) throw new BadRequestException('Defined questions do not use answer options');

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
      select: { id: true, text: true, imageUrl: true, question: { select: { type: true, definition: true } } },
    });

    if (!option) {
      throw new NotFoundException('Assessment answer option not found');
    }

    if (option.question && (option.question.definition || ['matching', 'ordering', 'fill_blank', 'short_answer'].includes(option.question.type))) throw new BadRequestException('Defined questions do not use answer options');
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
      select: { id: true, question: { select: { type: true, definition: true } } },
    });

    if (!option) {
      throw new NotFoundException('Assessment answer option not found');
    }

    if (option.question && (option.question.definition || ['matching', 'ordering', 'fill_blank', 'short_answer'].includes(option.question.type))) throw new BadRequestException('Defined questions do not use answer options');
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
      select: { id: true, type: true, definition: true },
    });

    if (!question) {
      throw new NotFoundException('Assessment question not found');
    }
    return question;
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

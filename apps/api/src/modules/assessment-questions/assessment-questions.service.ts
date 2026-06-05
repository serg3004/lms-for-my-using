import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateAssessmentAnswerOptionInput, CreateAssessmentQuestionInput } from './assessment-questions.schemas.js';

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
  options: {
    where: { deletedAt: null },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      questionId: true,
      text: true,
      imageUrl: true,
      order: true,
    },
  },
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
      orderBy: { order: 'asc' },
      select: assessmentQuestionSelect,
    });
  }

  async listLearnerQuizQuestions(assessmentId: string, organizationId: string) {
    await this.ensurePublishedAssessmentExists(assessmentId, organizationId);

    return this.prisma.assessmentQuestion.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      select: learnerAssessmentQuestionSelect,
    });
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

  async listAnswerOptions(questionId: string, organizationId: string) {
    await this.ensureQuestionExists(questionId, organizationId);

    return this.prisma.assessmentAnswerOption.findMany({
      where: {
        questionId,
        organizationId,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
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
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
  }
}

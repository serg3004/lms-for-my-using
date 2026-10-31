import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { type WriteLongreadQuestion, writeLongreadQuestionSchema } from '@lms/shared/longread-exercises';
import { validateQuestionDefinition } from '../../common/assessment-question-definition.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LongreadsService } from './longreads.service.js';

@Injectable()
export class LongreadQuestionBankService {
  constructor(private readonly prisma: PrismaService, private readonly drafts: LongreadsService) {}
  async list(lessonId: string, organizationId: string) {
    await this.drafts.getDraft(lessonId, organizationId);
    return this.prisma.assessment.findMany({ where: { lessonId, organizationId, deletedAt: null }, orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, passingScore: true, maxAttempts: true, questions: { where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { options: { where: { deletedAt: null }, orderBy: { order: 'asc' } } } } } });
  }
  async save(lessonId: string, organizationId: string, revision: number, raw: WriteLongreadQuestion) {
    const input = writeLongreadQuestionSchema.parse(raw), definition = validateQuestionDefinition(input.type, input.definition);
    if (definition ? input.options.length !== 0 : input.options.length < 2 || !input.options.some((option) => option.isCorrect) || input.type !== 'multiple_choice' && input.options.filter((option) => option.isCorrect).length !== 1) throw new BadRequestException('Invalid question options');
    if (new Set(input.options.flatMap((option) => option.id ? [option.id] : [])).size !== input.options.filter((option) => option.id).length) throw new BadRequestException('Duplicate option ids');
    await this.drafts.ensureEnabled(organizationId);
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.longreadDocument.findFirst({ where: { lessonId, organizationId, lesson: { deletedAt: null } }, select: { id: true } });
      if (!document) throw new NotFoundException('Longread not found');
      await tx.$queryRaw`SELECT id FROM longread_documents WHERE id = ${document.id}::uuid FOR UPDATE`;
      const current = await tx.longreadDocument.findUniqueOrThrow({ where: { id: document.id } });
      if (current.draftRevision !== revision) throw new ConflictException('Longread draft changed');
      const lesson = await tx.lesson.findFirstOrThrow({ where: { id: lessonId, organizationId }, select: { courseId: true, title: true } });
      if (input.questionId) await tx.$queryRaw`SELECT id FROM assessment_questions WHERE id = ${input.questionId}::uuid FOR UPDATE`;
      const existing = input.questionId ? await tx.assessmentQuestion.findFirst({ where: { id: input.questionId, organizationId, deletedAt: null, assessment: { lessonId, organizationId, deletedAt: null } } }) : null;
      if (input.questionId && !existing) throw new NotFoundException('Question not found');
      if (existing && (!input.updatedAt || existing.updatedAt.toISOString() !== input.updatedAt)) throw new ConflictException('Question changed');
      if (existing && input.assessmentId && input.assessmentId !== existing.assessmentId) throw new BadRequestException('Cannot move question to another assessment');
      let assessment = existing || input.assessmentId ? await tx.assessment.findFirst({ where: { id: existing?.assessmentId ?? input.assessmentId, lessonId, organizationId, deletedAt: null } }) : await tx.assessment.findFirst({ where: { lessonId, organizationId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
      if (input.assessmentId && !assessment) throw new NotFoundException('Assessment not found');
      if (!assessment) assessment = await tx.assessment.create({ data: { organizationId, courseId: lesson.courseId, lessonId, title: lesson.title, slug: `longread-${randomUUID()}`, availableAfterCourseCompletion: false, status: 'draft' } });
      await tx.assessment.update({ where: { id: assessment.id }, data: { passingScore: input.assessmentPassingScore, maxAttempts: input.assessmentMaxAttempts } });
      const data = { type: input.type, title: input.title, text: input.text, definition: definition ?? Prisma.DbNull, scoringMode: input.scoringMode };
      const question = existing ? await tx.assessmentQuestion.update({ where: { id: existing.id }, data }) : await tx.assessmentQuestion.create({ data: { ...data, organizationId, assessmentId: assessment.id } });
      const oldOptions = await tx.assessmentAnswerOption.findMany({ where: { questionId: question.id, organizationId, deletedAt: null } });
      if (input.options.some((option) => option.id && !oldOptions.some((old) => old.id === option.id))) throw new BadRequestException('Option does not belong to this question');
      await tx.assessmentAnswerOption.updateMany({ where: { questionId: question.id, organizationId, deletedAt: null, id: { notIn: input.options.flatMap((option) => option.id ? [option.id] : []) } }, data: { deletedAt: new Date() } });
      for (const [order, option] of input.options.entries()) {
        const fields = { text: option.text, isCorrect: option.isCorrect, imageUrl: null, order };
        if (option.id) await tx.assessmentAnswerOption.update({ where: { id: option.id }, data: fields });
        else await tx.assessmentAnswerOption.create({ data: { ...fields, organizationId, questionId: question.id } });
      }
      await tx.longreadDocument.update({ where: { id: document.id }, data: { draftRevision: { increment: 1 } } });
      return { questionId: question.id, revision: revision + 1 };
    });
  }
}

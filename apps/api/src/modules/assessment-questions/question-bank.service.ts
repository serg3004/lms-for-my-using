import { assessmentMaterialSchema } from '@lms/shared/longread-media';
import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { refreshPublishedAssessmentExercises } from '../longreads/public.js';
import { validateQuestionDefinition } from '../../common/assessment-question-definition.js';
import { PrismaService } from '../../database/prisma.service.js';
import { createAssessmentQuestionSchema } from './assessment-questions.schemas.js';

export const bankContentSchema = createAssessmentQuestionSchema.omit({ organizationId: true, order: true }).extend({
  text: z.string().max(4000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(), material: assessmentMaterialSchema.nullable().optional(),
  options: z.array(z.object({
    text: z.string().trim().min(1).max(2000).nullable(),
    imageUrl: z.string().trim().min(1).max(2000).nullable(), material: assessmentMaterialSchema.nullable().optional(),
    isCorrect: z.boolean(),
  }).refine((option) => option.text || option.imageUrl || option.material)).max(100),
  correctFeedback: z.string().max(2000).nullable().optional(),
  incorrectFeedback: z.string().max(2000).nullable().optional(),
});
type BankContent = z.infer<typeof bankContentSchema>;

function validateContent(input: unknown) {
  const content = bankContentSchema.parse(input);
  const definition = validateQuestionDefinition(content.type, content.definition);
  const correct = content.options.filter((option) => option.isCorrect).length;
  if (definition ? content.options.length : content.options.length < 2 || correct === 0 || (content.type !== 'multiple_choice' && correct !== 1)) {
    throw new BadRequestException('Invalid question options');
  }
  return content;
}

function placementData(content: BankContent) {
  return {
    title: content.title, type: content.type, text: content.text ?? null, imageUrl: content.imageUrl ?? null, material: content.material ?? null,
    scoringMode: content.scoringMode, definition: content.definition ?? Prisma.DbNull,
    correctFeedback: content.correctFeedback ?? null, incorrectFeedback: content.incorrectFeedback ?? null,
  };
}

function placementOptions(content: BankContent, organizationId: string) {
  return content.options.map((option, order) => ({ ...option, organizationId, order }));
}

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  /** PR 584: the entries come 50 at a time; `total` counts every match in the folder. */
  async list(organizationId: string, search: string, folderId?: string, page = 1) {
    const pageSize = 50;
    const where = { organizationId, folderId, title: { contains: search, mode: 'insensitive' as const } };
    const [folders, entries, total] = await Promise.all([
      this.prisma.questionBankFolder.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
      this.prisma.questionBankEntry.findMany({
        where, orderBy: [{ title: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.questionBankEntry.count({ where }),
    ]);
    return { folders, entries, total, page, pageSize };
  }

  createFolder(organizationId: string, name: string) {
    return this.prisma.questionBankFolder.create({ data: { organizationId, name } });
  }

  async create(organizationId: string, folderId: string, input: unknown) {
    const content = validateContent(input);
    return this.prisma.$transaction(async (tx) => {
      await this.lockFolder(tx, organizationId, folderId);
      const entry = await tx.questionBankEntry.create({ data: { organizationId, folderId, title: content.title, content } });
      await this.appendToSamples(tx, organizationId, folderId, [entry]);
      return entry;
    });
  }

  get(organizationId: string, id: string) {
    return this.entry(this.prisma, organizationId, id);
  }

  async import(organizationId: string, folderId: string, rows: { row: number; content: unknown }[]) {
    const errors: number[] = [];
    const data = rows.flatMap(({ row, content }) => {
      try {
        const validated = validateContent(content);
        return [{ organizationId, folderId, title: validated.title, content: validated }];
      } catch (error) {
        if (!(error instanceof z.ZodError || error instanceof BadRequestException)) throw error;
        errors.push(row);
        return [];
      }
    });
    return this.prisma.$transaction(async (tx) => {
      await this.lockFolder(tx, organizationId, folderId);
      if (!data.length) return { count: 0, errors };
      const entries = await tx.questionBankEntry.createManyAndReturn({ data, select: { id: true, content: true } });
      await this.appendToSamples(tx, organizationId, folderId, entries);
      return { count: entries.length, errors };
    });
  }

  private async entry(db: Prisma.TransactionClient, organizationId: string, id: string) {
    const entry = await db.questionBankEntry.findFirst({ where: { organizationId, id } });
    if (!entry) throw new NotFoundException('Question bank entry not found');
    return entry;
  }

  async usage(organizationId: string, id: string, db: Prisma.TransactionClient = this.prisma) {
    const entry = await this.entry(db, organizationId, id);
    const assessments = await db.assessment.findMany({
      where: { organizationId, deletedAt: null, questions: { some: { bankEntryId: id, deletedAt: null } } },
      orderBy: { id: 'asc' },
      select: {
        id: true, title: true, course: { select: { id: true, title: true } },
        placements: { where: { deletedAt: null }, orderBy: { id: 'asc' }, select: {
          course: { select: { id: true, title: true } },
          lesson: { select: { id: true, title: true } }, longreadBlockId: true,
        } },
      },
    });
    const courses = [...new Map(assessments.flatMap(({ course, placements }) =>
      [course, ...placements.map((placement) => placement.course)].flatMap((item) => item ? [[item.id, item] as const] : []))).values()];
    const longreads = [...new Map(assessments.flatMap(({ placements }) =>
      placements.flatMap(({ longreadBlockId, lesson }) => longreadBlockId && lesson ? [[lesson.id, lesson] as const] : []))).values()];
    const confirmation = createHash('sha256').update(JSON.stringify([id, entry.revision, assessments])).digest('hex');
    return { assessments, courses, longreads, confirmation };
  }

  async update(organizationId: string, id: string, input: unknown, confirmation: string, actorId?: string) {
    const content = validateContent(input);
    return this.prisma.$transaction(async (tx) => {
      await this.lockEntry(tx, organizationId, id);
      const affected = await tx.assessment.findMany({
        where: { organizationId, deletedAt: null, questions: { some: { bankEntryId: id, deletedAt: null } } },
        orderBy: { id: 'asc' }, select: { id: true },
      });
      for (const assessment of affected) await this.lockAssessment(tx, organizationId, assessment.id);
      const usage = await this.usage(organizationId, id, tx);
      if (usage.confirmation !== confirmation) throw new ConflictException('Review the question usage before saving');
      const entry = await tx.questionBankEntry.update({
        where: { id, organizationId }, data: { title: content.title, content, revision: { increment: 1 } },
      });
      const placements = await tx.assessmentQuestion.findMany({
        where: { organizationId, bankEntryId: id, deletedAt: null, assessment: { deletedAt: null } },
        select: { id: true, assessmentId: true },
      });
      const updatedOptions = new Map<string, { id: string; text: string | null; imageUrl: string | null; material: string | null; order: number; isCorrect: boolean }[]>();
      for (const placement of placements) {
        const updated = await tx.assessmentQuestion.update({
          where: { id: placement.id },
          data: {
            ...placementData(content),
            options: {
              updateMany: { where: { deletedAt: null }, data: { deletedAt: new Date() } },
              create: placementOptions(content, organizationId),
            },
          },
          select: { options: {
            where: { deletedAt: null }, orderBy: { order: 'asc' },
            select: { id: true, text: true, imageUrl: true, material: true, order: true, isCorrect: true },
          } },
        });
        updatedOptions.set(placement.id, updated.options);
      }
      await refreshPublishedAssessmentExercises(tx, organizationId, usage.longreads.map(({ id }) => id), (old) => {
        const options = updatedOptions.get(old.id);
        return options ? {
          ...old, title: content.title, type: content.type, text: content.text ?? null, imageUrl: content.imageUrl ?? null, material: content.material ?? null,
          definition: content.definition ?? null, scoringMode: content.scoringMode, options,
        } : old;
      }, actorId);
      for (const assessment of affected) {
        await tx.auditLog.create({ data: {
          organizationId, actorId, action: 'assessment.question-bank.update', targetType: 'assessment',
          targetId: assessment.id, summary: 'Updated a linked bank question', metadata: { bankEntryId: id, revision: entry.revision },
        } });
      }
      await tx.assessment.updateMany({ where: { id: { in: placements.map((item) => item.assessmentId) }, organizationId }, data: { updatedAt: new Date() } });
      return entry;
    });
  }

  async link(organizationId: string, assessmentId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockEntry(tx, organizationId, id);
      const entry = await this.entry(tx, organizationId, id);
      await this.lockAssessment(tx, organizationId, assessmentId);
      const existing = await tx.assessmentQuestion.findFirst({
        where: { organizationId, assessmentId, bankEntryId: id, bankSampleCandidate: false, deletedAt: null },
      });
      if (existing) return existing;
      const linked = await this.createPlacement(tx, organizationId, assessmentId, entry, false);
      const assessment = await tx.assessment.findUniqueOrThrow({ where: { id: assessmentId }, select: { editorDraft: true } });
      const draft = z.looseObject({ questions: z.array(z.unknown()) }).safeParse(assessment.editorDraft);
      const data: Prisma.AssessmentUncheckedUpdateInput = { updatedAt: new Date() };
      if (draft.success) {
        const { id: questionId, title, type, text, imageUrl, material, points, scoringMode, correctFeedback, incorrectFeedback, definition, options } = linked;
        data.editorDraft = {
          ...draft.data,
          questions: [...draft.data.questions, { id: questionId, title, type, text, imageUrl, material, points, scoringMode,
            correctFeedback, incorrectFeedback, definition, options }],
        } as Prisma.InputJsonValue;
      }
      await tx.assessment.update({ where: { id: assessmentId }, data });
      return linked;
    });
  }

  async configureSample(organizationId: string, assessmentId: string, folderId: string, size: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockFolder(tx, organizationId, folderId);
      const entries = await tx.questionBankEntry.findMany({
        where: { organizationId, folderId }, orderBy: { id: 'asc' }, take: 501,
      });
      if (entries.length < size || entries.length > 500) throw new BadRequestException('Invalid sample size for the folder');
      await tx.$queryRaw`
        SELECT id FROM question_bank_entries
        WHERE organization_id = ${organizationId}::uuid AND id IN (${Prisma.join(entries.map(({ id }) => Prisma.sql`${id}::uuid`))})
        ORDER BY id FOR UPDATE
      `;
      await this.lockAssessment(tx, organizationId, assessmentId);
      await tx.assessmentQuestion.updateMany({
        where: { assessmentId, organizationId, bankSampleCandidate: true, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const candidates = await tx.questionBankEntry.findMany({ where: { organizationId, folderId }, orderBy: { id: 'asc' } });
      await this.createCandidates(tx, organizationId, assessmentId, candidates);
      return tx.assessment.update({ where: { id: assessmentId }, data: { bankSampleSize: size, bankSampleFolderId: folderId } });
    });
  }

  private async appendToSamples(tx: Prisma.TransactionClient, organizationId: string, folderId: string,
    entries: { id: string; content: unknown }[]) {
    const assessments = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM assessments WHERE organization_id = ${organizationId}::uuid
        AND bank_sample_folder_id = ${folderId}::uuid AND deleted_at IS NULL
      ORDER BY id FOR UPDATE
    `;
    for (const { id } of assessments) await this.createCandidates(tx, organizationId, id, entries);
  }

  private async createCandidates(tx: Prisma.TransactionClient, organizationId: string, assessmentId: string,
    entries: { id: string; content: unknown }[]) {
    const fixedOrder = await tx.assessmentQuestion.aggregate({
      where: { organizationId, assessmentId, deletedAt: null }, _max: { order: true },
    });
    const options: Prisma.AssessmentAnswerOptionCreateManyInput[] = [];
    const questions = entries.map((entry, index) => {
      const id = randomUUID();
      const content = bankContentSchema.parse(entry.content);
      options.push(...placementOptions(content, organizationId).map((option) => ({ ...option, questionId: id })));
      return {
        ...placementData(content), id, organizationId, assessmentId, bankEntryId: entry.id, bankSampleCandidate: true,
        points: content.points, order: (fixedOrder._max.order ?? -1) + index + 1,
      };
    });
    await tx.assessmentQuestion.createMany({ data: questions });
    if (options.length) await tx.assessmentAnswerOption.createMany({ data: options });
  }

  private async lockFolder(tx: Prisma.TransactionClient, organizationId: string, folderId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM question_bank_folders WHERE id = ${folderId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Question bank folder not found');
  }

  private async createPlacement(tx: Prisma.TransactionClient, organizationId: string, assessmentId: string,
    entry: { id: string; content: unknown }, bankSampleCandidate: boolean) {
    const content = bankContentSchema.parse(entry.content);
    const order = await tx.assessmentQuestion.aggregate({
      where: { organizationId, assessmentId, deletedAt: null }, _max: { order: true },
    });
    return tx.assessmentQuestion.create({
      data: {
        ...placementData(content), organizationId, assessmentId, bankEntryId: entry.id, bankSampleCandidate,
        points: content.points, order: (order._max.order ?? -1) + 1,
        options: { create: placementOptions(content, organizationId) },
      },
      include: { options: { orderBy: { order: 'asc' }, select: { id: true, text: true, imageUrl: true, material: true, isCorrect: true } } },
    });
  }

  private async lockAssessment(tx: Prisma.TransactionClient, organizationId: string, assessmentId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM assessments WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Assessment not found');
  }

  async detach(organizationId: string, questionId: string) {
    const question = await this.prisma.assessmentQuestion.findFirst({ where: { id: questionId, organizationId, deletedAt: null } });
    if (!question) throw new NotFoundException('Assessment question not found');
    if (question.bankSampleCandidate) throw new BadRequestException('Change the sampling settings to replace a sample question');
    if (!question.bankEntryId) return question;
    return this.prisma.$transaction(async (tx) => {
      await this.lockEntry(tx, organizationId, question.bankEntryId!);
      await this.lockAssessment(tx, organizationId, question.assessmentId);
      const detached = await tx.assessmentQuestion.update({ where: { id: questionId, organizationId, deletedAt: null }, data: { bankEntryId: null } });
      await tx.assessment.update({ where: { id: question.assessmentId }, data: { updatedAt: new Date() } });
      return detached;
    });
  }

  private async lockEntry(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM question_bank_entries WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Question bank entry not found');
  }
}

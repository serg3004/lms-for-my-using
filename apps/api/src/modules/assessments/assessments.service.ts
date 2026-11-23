import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { validateQuestionDefinition } from '../../common/assessment-question-definition.js';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
import {
  AssessmentLibraryQuery,
  SaveAssessmentEditorInput,
  assessmentEditorContentSchema,
  CreateAssessmentInput,
  AssessmentPlacementInput,
  UpdateAssessmentInput,
  UpdateAssessmentStatusInput,
} from './assessments.schemas.js';

import { lockAssessmentFolders } from './assessment-folder-lock.js';
import { assessmentCourseScope } from './assessment-author-scope.js';

import { queryAssessmentLibrary } from './assessment-library.query.js';

const assessmentSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  folderId: true,
  isLongreadExercise: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  passingScore: true,
  maxAttempts: true,
  timeLimitMinutes: true,
  availableAfterCourseCompletion: true,
  passMessage: true,
  failMessage: true,
  showCorrectAnswers: true,
  randomizeOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssessments(organizationId: string, instructorId?: string) {
    return this.prisma.assessment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(instructorId ? { course: { instructors: { some: { instructorId, organizationId, deletedAt: null } } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LEGACY_LIST_LIMIT,
      select: assessmentSelect,
    });
  }

  listLibrary(organizationId: string, userId: string, courseScoped: boolean, query: AssessmentLibraryQuery) {
    return queryAssessmentLibrary(this.prisma, organizationId, userId, courseScoped, query);
  }

  async getAssessment(assessmentId: string, organizationId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        organizationId,
        deletedAt: null,
      },
      select: assessmentSelect,
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  async createAssessment(input: CreateAssessmentInput, createdBy?: string) {
    if (input.courseId) await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.lessonId) {
      if (!input.courseId) throw new BadRequestException('A lesson requires a course');
      await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, input.organizationId);
    }

    return this.prisma.assessment.create({
      data: { ...input, ...(createdBy ? { createdBy } : {}) },
      select: assessmentSelect,
    });
  }

  copyAssessment(id: string, organizationId: string, createdBy: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockAssessmentFolders(tx, organizationId);
      const source = await tx.assessment.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: {
          ...assessmentSelect,
          editorDraft: true,
          questions: {
            where: { organizationId, deletedAt: null },
            select: {
              type: true, title: true, text: true, imageUrl: true, points: true, order: true, definition: true, scoringMode: true,
              options: { where: { organizationId, deletedAt: null }, select: { text: true, imageUrl: true, isCorrect: true, order: true } },
            },
          },
        },
      });
      if (!source) throw new NotFoundException('Assessment not found');
      const { questions, isLongreadExercise, courseId, folderId, title, description, passingScore, maxAttempts,
        timeLimitMinutes, availableAfterCourseCompletion, passMessage, failMessage, showCorrectAnswers, randomizeOrder } = source;
      const draft = source.editorDraft == null ? null : assessmentEditorContentSchema.parse(source.editorDraft);
      const copiedQuestions = draft?.questions.map(({ type, title, text, imageUrl, points, definition, scoringMode, options }, order) => ({
        type, title, text, imageUrl, points, definition, scoringMode, order,
        options: options.map(({ text, imageUrl, isCorrect }, order) => ({ text, imageUrl, isCorrect, order })),
      })) ?? questions;
      return tx.assessment.create({
        data: {
          courseId, folderId, title, description, passingScore, maxAttempts, timeLimitMinutes,
          availableAfterCourseCompletion, passMessage, failMessage, showCorrectAnswers, randomizeOrder,
          ...draft?.settings,
          organizationId, createdBy, slug: `copy-${randomUUID()}`, status: 'draft',
          // A copy is an independent assessment, even when the source came from a longread.
          lessonId: isLongreadExercise ? null : source.lessonId,
          questions: { create: copiedQuestions.map(({ options, definition, ...question }) => ({
            ...question, organizationId, definition: definition ?? Prisma.DbNull,
            options: { create: options.map((option) => ({ ...option, organizationId })) },
          })) },
        },
        select: assessmentSelect,
      });
    });
  }

  async getEditor(id: string, organizationId: string) {
    const record = await this.prisma.assessment.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        ...assessmentSelect,
        editorDraft: true,
        questions: {
          where: { organizationId, deletedAt: null },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            id: true, type: true, title: true, text: true, imageUrl: true, points: true, definition: true, scoringMode: true,
            options: {
              where: { organizationId, deletedAt: null },
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              select: { id: true, text: true, imageUrl: true, isCorrect: true },
            },
          },
        },
        placements: {
          where: { organizationId, deletedAt: null, course: { deletedAt: null } },
          select: { id: true, longreadBlockId: true, course: { select: { title: true } }, lesson: { select: { title: true } } },
        },
        standaloneAssignments: {
          where: { organizationId, user: { deletedAt: null } },
          select: { userId: true, dueAt: true, user: { select: { firstName: true, lastName: true } } },
          orderBy: { dueAt: 'asc' },
        },
      },
    });
    if (!record) throw new NotFoundException('Assessment not found');
    const { editorDraft, questions, placements, standaloneAssignments, ...assessment } = record;
    return { assessment, draft: editorDraft, questions, placements, assignments: standaloneAssignments };
  }

  async saveEditor(id: string, organizationId: string, input: SaveAssessmentEditorInput) {
    const { content, action, confirmPublished, revision } = input;
    for (const question of content.questions) validateQuestionDefinition(question.type, question.definition);
    if (action === 'publish') {
      if (!content.questions.length) throw new BadRequestException('Cannot publish assessment: it has no questions');
      const missing = content.questions.filter((question) => {
        const correct = question.options.filter((option) => option.isCorrect).length;
        return !question.definition && (correct === 0 || (question.type !== 'multiple_choice' && correct !== 1));
      });
      if (missing.length) throw new BadRequestException(missing.map((question) => question.title).join(', '));
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const where = { id, organizationId, deletedAt: null };
      const current = await tx.assessment.findFirst({ where, select: { updatedAt: true, status: true, timeLimitMinutes: true } });
      if (!current) throw new NotFoundException('Assessment not found');
      if (current.updatedAt.toISOString() !== revision) throw new ConflictException('Assessment was changed by another editor');
      if (current.status === 'published' && !confirmPublished) throw new ConflictException('Confirm changes to the published assessment');

      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      if (current.status === 'published' && (action === 'save' || action === 'archive')) {
        return tx.assessment.update({
          where, data: { updatedAt, editorDraft: content, ...(action === 'archive' ? { status: 'archived' } : {}) }, select: { updatedAt: true, status: true },
        });
      }

      if (action === 'publish' && current.status === 'published') {
        const active = await tx.assessmentAttempt.findFirst({
          where: {
            assessmentId: id, organizationId, status: 'in_progress', deletedAt: null,
            ...(current.timeLimitMinutes ? { startedAt: { gt: new Date(Date.now() - current.timeLimitMinutes * 60_000) } } : {}),
          },
          select: { id: true },
        });
        if (active) throw new ConflictException('Cannot publish while an attempt is in progress');
      }

      const deletedAt = new Date();
      await tx.assessmentQuestion.updateMany({
        where: { assessmentId: id, organizationId, deletedAt: null, id: { notIn: content.questions.map((question) => question.id) } },
        data: { deletedAt },
      });
      for (const [order, { id: questionId, options, definition, ...fields }] of content.questions.entries()) {
        const question = { ...fields, order, definition: definition ?? Prisma.DbNull, deletedAt: null };
        await tx.assessmentQuestion.upsert({
          where: { id: questionId, assessmentId: id, organizationId },
          update: question,
          create: { ...question, id: questionId, assessmentId: id, organizationId },
        });
        await tx.assessmentAnswerOption.updateMany({
          where: { questionId, organizationId, deletedAt: null, id: { notIn: options.map((option) => option.id) } },
          data: { deletedAt },
        });
        for (const [optionOrder, { id: optionId, ...fields }] of options.entries()) {
          const option = { ...fields, order: optionOrder, deletedAt: null };
          await tx.assessmentAnswerOption.upsert({
            where: { id: optionId, questionId, organizationId },
            update: option,
            create: { ...option, id: optionId, questionId, organizationId },
          });
        }
      }
      return tx.assessment.update({
        where,
        data: {
          ...content.settings,
          updatedAt,
          status: action === 'save' ? current.status : ({ publish: 'published', archive: 'archived', draft: 'draft' } as const)[action],
          editorDraft: Prisma.DbNull,
        },
        select: { updatedAt: true, status: true },
      });
    }, { timeout: 15000 });
  }

  async listPlacements(assessmentId: string, organizationId: string) {
    await this.getAssessment(assessmentId, organizationId);
    return this.prisma.assessmentPlacement.findMany({
      where: { assessmentId, organizationId, deletedAt: null, course: { deletedAt: null } },
      orderBy: { id: 'asc' },
    });
  }

  async attachPlacement(assessmentId: string, organizationId: string, input: AssessmentPlacementInput) {
    const { questionId, ...location } = input;
    await this.ensureCourseExists(input.courseId, organizationId);
    if (input.lessonId) await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, organizationId, deletedAt: null }, select: { id: true },
      });
      if (!assessment) throw new NotFoundException('Assessment not found');
      if (input.longreadBlockId) {
        const document = await tx.longreadDocument.findFirst({
          where: { lessonId: input.lessonId, organizationId }, select: { id: true },
        });
        if (!document) throw new NotFoundException('Longread not found');
        await tx.$queryRaw`SELECT id FROM longread_documents WHERE id = ${document.id}::uuid FOR UPDATE`;
        const block = await tx.longreadBlock.findFirst({
          where: { id: input.longreadBlockId, organizationId, type: 'exercise',
            chapter: { documentId: document.id } },
          select: { id: true, content: true },
        });
        if (!block) throw new NotFoundException('Longread exercise not found');
        const question = await tx.assessmentQuestion.findFirst({
          where: { id: questionId, assessmentId, organizationId, deletedAt: null }, select: { id: true },
        });
        if (!question) throw new NotFoundException('Assessment question not found');
        await tx.assessmentPlacement.updateMany({
          where: { organizationId, longreadBlockId: block.id, assessmentId: { not: assessmentId }, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        const content = block.content && typeof block.content === 'object' && !Array.isArray(block.content) ? block.content : {};
        await tx.longreadBlock.update({ where: { id: block.id }, data: { content: { ...content, questionId: question.id } } });
        await tx.longreadDocument.update({ where: { id: document.id }, data: { draftRevision: { increment: 1 } } });
      }
      const locationKey = input.longreadBlockId ? `block:${input.longreadBlockId}`
        : input.lessonId ? `lesson:${input.lessonId}` : `course:${input.courseId}`;
      return tx.assessmentPlacement.upsert({
        where: { assessmentId_locationKey: { assessmentId, locationKey } },
        create: { assessmentId, organizationId, locationKey, ...location },
        update: { deletedAt: null },
      });
    });
  }

  async detachPlacement(assessmentId: string, placementId: string, organizationId: string) {
    const result = await this.prisma.assessmentPlacement.updateMany({
      where: { id: placementId, assessmentId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Assessment placement not found');
  }

  async updateAssessmentStatus(
    assessmentId: string,
    organizationId: string,
    status: UpdateAssessmentStatusInput['status'],
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (status === 'published') {
      await this.ensureQuestionsHaveCorrectOption(assessmentId, organizationId);
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId, organizationId },
      data: { status },
      select: assessmentSelect,
    });
  }

  async updateAssessment(assessmentId: string, organizationId: string, input: UpdateAssessmentInput) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (input.status === 'published') await this.ensureQuestionsHaveCorrectOption(assessmentId, organizationId);
    return this.prisma.assessment.update({
      where: { id: assessmentId, organizationId },
      data: input,
      select: assessmentSelect,
    });
  }

  async deleteAssessment(assessmentId: string, organizationId: string, instructorId?: string) {
    // SELECT ... FOR UPDATE locks the assessment row for the rest of this transaction, so a
    // concurrent startAttempt() (which takes the same lock before creating its attempt row —
    // see AssessmentAttemptsService.startAttempt) is fully serialized against this delete:
    // whichever transaction gets the lock first is the one the other sees committed.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockAssessmentFolders(tx, organizationId);
      const rows = await tx.$queryRaw<{ id: string; slug: string; timeLimitMinutes: number | null }[]>`
        SELECT id, slug, time_limit_minutes AS "timeLimitMinutes" FROM assessments
        WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      const assessment = rows[0];

      if (!assessment) {
        return 'not-found' as const;
      }

      if (instructorId && !await tx.assessment.findFirst({
        where: { id: assessmentId, organizationId, ...assessmentCourseScope(organizationId, instructorId) },
        select: { id: true },
      })) return 'not-found' as const;

      // An in_progress attempt only blocks deletion while it's still within its time limit — an
      // abandoned attempt past its deadline is spent (createAttempt would force passed: false on
      // late submission anyway) and shouldn't hold the assessment hostage forever. If the time
      // limit itself was since removed, there's no expiry to check against, so any in_progress
      // attempt still blocks.
      const activeAttempt = await tx.assessmentAttempt.findFirst({
        where: {
          assessmentId,
          status: 'in_progress',
          deletedAt: null,
          ...(assessment.timeLimitMinutes
            ? { startedAt: { gt: new Date(Date.now() - assessment.timeLimitMinutes * 60_000) } }
            : {}),
        },
        select: { id: true },
      });

      if (activeAttempt) {
        return 'conflict' as const;
      }

      await tx.assessment.update({
        where: { id: assessmentId, organizationId },
        data: { deletedAt: new Date(), slug: releaseSlugOnDelete(assessment.slug, assessment.id) },
      });

      return 'ok' as const;
    });

    if (outcome === 'not-found') {
      throw new NotFoundException('Assessment not found');
    }

    if (outcome === 'conflict') {
      throw new AssessmentAttemptInProgressException();
    }
  }

  private async ensureCourseExists(courseId: string, organizationId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }

  /**
   * Publishing an empty test or one with a question nobody can answer correctly would otherwise
   * only surface as a hard failure for the first learner to attempt it (createAttempt).
   */
  private async ensureQuestionsHaveCorrectOption(assessmentId: string, organizationId: string) {
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId, organizationId, deletedAt: null },
      select: {
        title: true,
        type: true,
        definition: true,
        options: { where: { deletedAt: null, isCorrect: true }, select: { id: true }, take: 1 },
      },
    });

    if (questions.length === 0) {
      throw new BadRequestException('Cannot publish assessment: it has no questions');
    }

    const missing = questions.filter((question) => {
      const definition = validateQuestionDefinition(question.type, question.definition);
      return !definition && question.options.length === 0;
    });

    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot publish assessment: questions without a correct answer option: ${missing.map((question) => question.title).join(', ')}`,
      );
    }
  }

  private async ensureLessonBelongsToCourse(lessonId: string, courseId: string, organizationId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        courseId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
  }
}

export class AssessmentAttemptInProgressException extends BadRequestException {
  constructor() {
    super('Cannot delete an assessment with an attempt in progress');
  }
}

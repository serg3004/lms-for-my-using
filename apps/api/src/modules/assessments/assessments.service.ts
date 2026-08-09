import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { releaseSlugOnDelete } from '../../common/soft-delete-slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateAssessmentInput,
  UpdateAssessmentInput,
  UpdateAssessmentStatusInput,
} from './assessments.schemas.js';

const assessmentSelect = {
  id: true,
  organizationId: true,
  courseId: true,
  lessonId: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  passingScore: true,
  maxAttempts: true,
  timeLimitMinutes: true,
  availableAfterCourseCompletion: true,
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
      select: assessmentSelect,
    });
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

  async createAssessment(input: CreateAssessmentInput) {
    await this.ensureCourseExists(input.courseId, input.organizationId);

    if (input.lessonId) {
      await this.ensureLessonBelongsToCourse(input.lessonId, input.courseId, input.organizationId);
    }

    return this.prisma.assessment.create({
      data: input,
      select: assessmentSelect,
    });
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

    return this.prisma.assessment.update({
      where: { id: assessmentId, organizationId },
      data: input,
      select: assessmentSelect,
    });
  }

  async deleteAssessment(assessmentId: string, organizationId: string) {
    // SELECT ... FOR UPDATE locks the assessment row for the rest of this transaction, so a
    // concurrent startAttempt() (which takes the same lock before creating its attempt row —
    // see AssessmentAttemptsService.startAttempt) is fully serialized against this delete:
    // whichever transaction gets the lock first is the one the other sees committed.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; slug: string }[]>`
        SELECT id, slug FROM assessments
        WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      const assessment = rows[0];

      if (!assessment) {
        return 'not-found' as const;
      }

      const activeAttempt = await tx.assessmentAttempt.findFirst({
        where: { assessmentId, status: 'in_progress', deletedAt: null },
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
      throw new BadRequestException('Cannot delete an assessment with an attempt in progress');
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
        options: { where: { deletedAt: null, isCorrect: true }, select: { id: true }, take: 1 },
      },
    });

    if (questions.length === 0) {
      throw new BadRequestException('Cannot publish assessment: it has no questions');
    }

    const missing = questions.filter((question) => question.options.length === 0);

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

import { publicAttemptContext } from '../../common/assessment-frozen.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { gradeAssessmentAnswers, type QuestionWithOptions } from '../../common/assessment-grading.js';
import { createAssessmentAttemptSchema } from './assessment-attempts.schemas.js';

import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
import { ManagerTeamScope, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import {
  CreateAssessmentAttemptInput,
} from './assessment-attempts.schemas.js';

export { buildAttemptResultNotification } from '../../common/assessment-recording.js';
import { recordCompletedAssessment } from '../../common/assessment-recording.js';

const attemptSelect = {
  longreadMetadata: true,
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
  response: true,
  isCorrect: true,
  score: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AssessmentAttemptsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAttempts(assessmentId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    await this.finalizeExpiredAttempts(assessmentId, organizationId, assessment.timeLimitMinutes);

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        organizationId,
        countsTowardResults: true,
        ...this.teamScope.userOwnedResource(actor),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: LEGACY_LIST_LIMIT,
      select: attemptSelect,
    });
    return attempts.map(publicAttemptContext);
  }

  async getAttempt(attemptId: string, actorInput: TeamScopeActor | string) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: {
        id: attemptId,
        organizationId,
        countsTowardResults: true,
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
        assessment: { select: { timeLimitMinutes: true } },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    const { assessment, ...stored } = attempt;
    const attemptFields = publicAttemptContext(stored);

    if (attemptFields.status === 'in_progress') {
      const finalized = await this.finalizeExpiredAttempts(attemptFields.assessmentId, organizationId, assessment.timeLimitMinutes);
      if (finalized) {
        return { ...attemptFields, status: 'completed' as const, passed: false, score: 0, maxScore: finalized.maxScore, percentage: 0, completedAt: finalized.completedAt };
      }
    }

    return attemptFields;
  }

  /**
   * A timed attempt nobody ever submitted stays "in_progress" forever unless something notices it
   * expired — there's no separate scheduler in this app (background-jobs requires Redis, which
   * isn't guaranteed to be configured), so expiry is checked lazily on every read that surfaces
   * attempts for an assessment: listAttempts, getAttempt (and transitively startAttempt's resume
   * path, which calls getAttempt). Score is 0 since an abandoned attempt never recorded answers —
   * matches the late-submission behavior in createAttempt, which also forces passed: false.
   */
  private async finalizeExpiredAttempts(assessmentId: string, organizationId: string, timeLimitMinutes: number | null): Promise<{ maxScore: number; completedAt: Date } | null> {
    if (!timeLimitMinutes) {
      return null;
    }

    const cutoff = new Date(Date.now() - timeLimitMinutes * 60_000);
    const where = { assessmentId, organizationId, longreadRevisionId: null, status: 'in_progress' as const, deletedAt: null, startedAt: { lt: cutoff } };
    const expiredCount = await this.prisma.assessmentAttempt.count({ where });

    if (expiredCount === 0) {
      return null;
    }

    const questions = await this.getQuestions(assessmentId, organizationId);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const completedAt = new Date();

    await this.prisma.assessmentAttempt.updateMany({
      where,
      data: { status: 'completed', passed: false, score: 0, maxScore, percentage: 0, completedAt },
    });

    return { maxScore, completedAt };
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
    input = createAssessmentAttemptSchema.parse(input);
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);

    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(assessment.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    const inProgress = assessment.timeLimitMinutes
      ? await this.prisma.assessmentAttempt.findFirst({
          where: { assessmentId, userId, organizationId, longreadRevisionId: null, status: 'in_progress', deletedAt: null },
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
    const gradedAnswers = gradeAssessmentAnswers(questions, input.answers);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const expired = Boolean(
      inProgress && assessment.timeLimitMinutes && Date.now() - inProgress.startedAt.getTime() > assessment.timeLimitMinutes * 60_000,
    );
    const passed = expired ? false : percentage >= assessment.passingScore;
    const completedAt = new Date();

    const attemptId = await this.prisma.$transaction(async (tx) => {
      return recordCompletedAssessment(tx,
        { organizationId, assessmentId, userId, score, maxScore, percentage, passed, completedAt, status: 'completed' },
        gradedAnswers.map((answer) => ({ questionId: answer.questionId, selectedOptionId: answer.selectedOptionId,
          selectedOptionIds: answer.selectedOptionIds, response: answer.response, isCorrect: answer.isCorrect, score: answer.score })),
        assessment.courseId, assessment.title, inProgress?.id);

    });

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
  }

  /**
   * Dry-run grading for the assessment author (admin/instructor): reuses the exact same grading
   * logic as createAttempt (getQuestions/gradeAnswers/scoreMultipleChoiceAnswer), so the preview
   * can never diverge from how a real submission would be scored — but it writes nothing to the
   * database (no AssessmentAttempt row, no maxAttempts consumed, no certificate). Works for
   * draft assessments too, since previewing before publishing is the point.
   */
  async previewAttempt(assessmentId: string, organizationId: string, input: CreateAssessmentAttemptInput) {
    input = createAssessmentAttemptSchema.parse(input);
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, organizationId, deletedAt: null },
      select: { id: true, passingScore: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const questions = await this.getQuestions(assessmentId, organizationId);
    const gradedAnswers = gradeAssessmentAnswers(questions, input.answers);
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const passed = percentage >= assessment.passingScore;

    return { score, maxScore, percentage, passed, answers: gradedAnswers };
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
      where: { assessmentId, userId, organizationId, longreadRevisionId: null, status: 'in_progress', deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      return this.getAttempt(existing.id, { id: userId, organizationId, roles: ['learner'] });
    }

    await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts);

    // SELECT ... FOR UPDATE takes the same lock deleteAssessment() takes before soft-deleting,
    // so the two are fully serialized: whichever of the two transactions acquires the lock
    // first, the other only proceeds once it's committed and can see the up-to-date row.
    const attemptId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM assessments
        WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!rows[0]) {
        throw new NotFoundException('Assessment not found');
      }

      const attempt = await tx.assessmentAttempt.create({
        data: { organizationId, assessmentId, userId, status: 'in_progress', startedAt: new Date() },
        select: { id: true },
      });

      return attempt.id;
    });

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
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
        title: true,
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
      select: { id: true, timeLimitMinutes: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
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
        longreadRevisionId: null,
        countsTowardResults: true,
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
        definition: true,
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

}

import { randomUUID } from 'node:crypto';
import { publicQuestionDefinition } from '../../common/assessment-question-definition.js';
import type { Prisma } from '@prisma/client';
import { assessmentAnswerSchema, draftAssessmentAnswerSchema, questionDefinitionSchema, type AssessmentAnswer } from '@lms/shared/assessment-question-types';
import { requiresLockedAnswers, type AssessmentPolicy } from '@lms/shared/assessment-policy';
import { z } from 'zod';
import { assertAssessmentWindow, assessmentAttemptOrder, completedAssessmentAttempts, effectiveAssessmentResult, readAssessmentPolicy } from '../../common/assessment-policy.js';
import { publicAnswerKey } from '../../common/assessment-answer-key.js';
import { seededShuffle } from '../../common/seeded-shuffle.js';
import { frozenAssessmentQuestionSchema, publicAttemptContext } from '../../common/assessment-frozen.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { gradeAssessmentAnswers } from '../../common/assessment-grading.js';
import { createAssessmentAttemptSchema } from './assessment-attempts.schemas.js';

import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
import { attemptScope } from './attempt-scope.js';
import { ManagerTeamScope, normalizeActor } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import {
  CreateAssessmentAttemptInput,
} from './assessment-attempts.schemas.js';

export { buildAttemptResultNotification } from '../../common/assessment-recording.js';
import { recordCompletedAssessment } from '../../common/assessment-recording.js';

const bankSnapshotSchema = z.array(frozenAssessmentQuestionSchema.omit({ assessment: true }));

function publicSample(snapshot: unknown, assessmentId: string, organizationId: string, userId: string, shuffle: boolean) {
  return bankSnapshotSchema.parse(snapshot).map(({ id, type, title, text, imageUrl, material, order, points, scoringMode, definition, options }) => {
    const key = `${assessmentId}:${userId}:${id}`;
    const publicOptions = options.map((option) => ({
      id: option.id, text: option.text, imageUrl: option.imageUrl, material: option.material, order: option.order, questionId: id,
    }));
    return {
      id, type, title, text, imageUrl, material, order, points, scoringMode, assessmentId, organizationId,
      options: definition ? [] : shuffle ? seededShuffle(publicOptions, key) : publicOptions,
      ...(definition ? { definition: publicQuestionDefinition(definition, key) } : {}),
    };
  });
}

function freezeGradedAnswers(
  questions: ({ id: string; bankSampleCandidate?: boolean } & Prisma.InputJsonObject)[],
  answers: ReturnType<typeof gradeAssessmentAnswers>,
  assessment: { id: string; title: string; passingScore: number; maxAttempts: number | null;
    passMessage?: string | null; failMessage?: string | null; showCorrectAnswers?: boolean; policy?: Prisma.JsonValue; presentation?: Prisma.JsonValue },
) {
  const { id, title, passingScore, maxAttempts } = assessment;
  const resultSettings = {
    passMessage: assessment.passMessage ?? null, failMessage: assessment.failMessage ?? null,
    presentation: assessment.presentation ?? null,
    showCorrectAnswers: assessment.showCorrectAnswers ?? false, policy: assessment.policy ?? null,
  };
  return answers.map((answer, index) => {
    const question = { ...questions[index]! };
    delete question.bankSampleCandidate;
    return {
      ...answer,
      frozenQuestion: { question: { ...question, assessment: { id, title, passingScore, maxAttempts } }, revealAnswers: false, resultSettings },
    };
  });
}

const attemptSelect = {
  longreadMetadata: true,
  id: true,
  organizationId: true,
  assessmentId: true,
  placementId: true,
  courseId: true,
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
  reviewPending: true,
  reviewComment: true,
  isCorrect: true,
  score: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AssessmentAttemptsService {
  constructor(private readonly prisma: PrismaService, private readonly teamScope: ManagerTeamScope = new ManagerTeamScope()) {}

  async listAttempts(assessmentId: string, actorInput: TeamScopeActor | string, placementId?: string | null) {
    const actor = normalizeActor(actorInput);
    const organizationId = actor.organizationId;
    const assessment = await this.ensureAssessmentExists(assessmentId, organizationId);
    await this.finalizeExpiredAttempts(assessmentId, organizationId, assessment.timeLimitMinutes);

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        assessmentId,
        placementId,
        ...(placementId === null ? { longreadRevisionId: null } : {}),
        organizationId,
        countsTowardResults: true,
        ...attemptScope(this.teamScope, actor),
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
        ...attemptScope(this.teamScope, actor),
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
      const finalized = await this.finalizeExpiredAttempts(attemptFields.assessmentId, organizationId, assessment.timeLimitMinutes, attemptFields.id, attemptFields.maxScore);
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
  private async finalizeExpiredAttempts(assessmentId: string, organizationId: string, timeLimitMinutes: number | null, attemptId?: string, savedMaxScore = 0): Promise<{ maxScore: number; completedAt: Date } | null> {
    if (!timeLimitMinutes) return null;

    const cutoff = new Date(Date.now() - timeLimitMinutes * 60_000);
    const where = { assessmentId, organizationId, ...(attemptId ? { id: attemptId } : {}), longreadRevisionId: null, status: 'in_progress' as const, deletedAt: null, startedAt: { lte: cutoff } };
    const expiredCount = await this.prisma.assessmentAttempt.count({ where });
    if (!expiredCount) return null;

    const completedAt = new Date();
    const data = { status: 'completed' as const, passed: false, score: 0, percentage: 0, completedAt };
    if (attemptId && savedMaxScore > 0) {
      await this.prisma.assessmentAttempt.updateMany({ where, data });
      return { maxScore: savedMaxScore, completedAt };
    }

    const legacyWhere = { ...where, maxScore: 0 };
    let maxScore = 0;
    if (attemptId || await this.prisma.assessmentAttempt.count({ where: legacyWhere })) {
      maxScore = (await this.getQuestions(assessmentId, organizationId)).reduce((sum, question) => sum + question.points, 0);
      await this.prisma.assessmentAttempt.updateMany({ where: legacyWhere, data: { ...data, maxScore } });
    }
    if (!attemptId) await this.prisma.assessmentAttempt.updateMany({ where, data });

    return { maxScore, completedAt };
  }

  /**
   * Untimed assessments (timeLimitMinutes null — the common case, unchanged): grade and create the
   * completed attempt in one call, exactly as before startAttempt existed.
   *
   * Timed assessments: requires an existing in_progress attempt from startAttempt. Late submission
   * (now - startedAt >= timeLimitMinutes) still grades and records the answers, but forces
   * passed: false regardless of score — the attempt is spent, not silently rejected.
   */
  async createAttempt(assessmentId: string, userId: string, organizationId: string, input: CreateAssessmentAttemptInput) {
    input = createAssessmentAttemptSchema.parse(input);
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);

    const location = await this.resolvePlacement(assessment, organizationId, input.placementId);
    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(location.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    if (assessment.policy || assessment.bankSampleSize || input.attemptId) {
      return this.submitWithPolicy(assessmentId, userId, organizationId, location, input);
    }

    const attemptId = await this.prisma.$transaction(async (tx) => {
      const assessment = await this.lockAssessment(tx, assessmentId, organizationId);
      const inProgress = assessment.timeLimitMinutes
        ? await tx.assessmentAttempt.findFirst({
          where: { assessmentId, userId, organizationId, placementId: location.placementId, longreadRevisionId: null, status: 'in_progress', deletedAt: null },
          select: { id: true, startedAt: true, bankQuestionSnapshot: true },
        })
        : null;
      if (assessment.timeLimitMinutes && !inProgress) {
        throw new BadRequestException('Attempt was not started — call the start endpoint first');
      }
      if (!inProgress) {
        await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts, location.placementId, tx);
      }
      const questions = inProgress?.bankQuestionSnapshot
        ? bankSnapshotSchema.parse(inProgress.bankQuestionSnapshot)
        : await this.getQuestions(assessmentId, organizationId, tx);
      const gradedAnswers = gradeAssessmentAnswers(questions, input.answers);
      const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
      const score = gradedAnswers.reduce((sum, answer) => sum + answer.score, 0);
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const expired = Boolean(
        inProgress && assessment.timeLimitMinutes && Date.now() - inProgress.startedAt.getTime() >= assessment.timeLimitMinutes * 60_000,
      );
      const passed = expired ? false : percentage >= assessment.passingScore;
      const completedAt = new Date();

      return recordCompletedAssessment(tx,
        { organizationId, assessmentId, userId, ...location, score, maxScore, percentage, passed, completedAt, status: 'completed', ...(gradedAnswers.some((answer) => answer.reviewPending) ? { reviewPassingScore: expired ? 101 : assessment.passingScore } : {}) },
        freezeGradedAnswers(questions, gradedAnswers, assessment),
        location.courseId, assessment.title, inProgress?.id);
    });

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
  }

  private async submitWithPolicy(
    assessmentId: string,
    userId: string,
    organizationId: string,
    location: { placementId: string | null; courseId: string | null },
    input: CreateAssessmentAttemptInput,
  ) {
    const attemptId = await this.prisma.$transaction(async (tx) => {
      const assessment = await this.lockAssessment(tx, assessmentId, organizationId);
      const policy = readAssessmentPolicy(assessment.policy);
      const scope = { assessmentId, userId, organizationId, placementId: location.placementId, longreadRevisionId: null };
      if (input.attemptId) {
        const submitted = await tx.assessmentAttempt.findFirst({ where: {
          ...scope, id: input.attemptId, deletedAt: null, status: { in: ['completed', 'pending_review'] },
        }, select: { id: true } });
        if (submitted) return submitted.id;
      }
      assertAssessmentWindow(policy);
      const locked = requiresLockedAnswers(policy);
      if (locked && !input.attemptId) throw new BadRequestException('A locked assessment submission requires the attempt ID');
      const active = assessment.timeLimitMinutes || locked || assessment.bankSampleSize || input.attemptId
        ? await tx.assessmentAttempt.findFirst({ where: { ...scope, ...(input.attemptId ? { id: input.attemptId } : {}), status: 'in_progress', deletedAt: null },
          select: { id: true, startedAt: true, lockedAnswers: true, bankQuestionSnapshot: true } })
        : null;
      if ((assessment.timeLimitMinutes || locked || assessment.bankSampleSize || input.attemptId) && !active) throw new BadRequestException('Attempt was not started — call the start endpoint first');
      if (!active) await this.ensureAttemptAllowed(tx, scope, assessment.maxAttempts, policy);

      const questions = active?.bankQuestionSnapshot
        ? bankSnapshotSchema.parse(active.bankQuestionSnapshot)
        : await this.getQuestions(assessmentId, organizationId, tx);
      const now = new Date();
      if (active && input.attemptId && assessment.timeLimitMinutes
        && now.getTime() - active.startedAt.getTime() >= assessment.timeLimitMinutes * 60_000) {
        await tx.assessmentAttempt.updateMany({
          where: { id: active.id, status: 'in_progress' },
          data: { status: 'completed', maxScore: questions.reduce((sum, question) => sum + question.points, 0), completedAt: now },
        });
        return active.id;
      }
      const answers = locked ? z.array(assessmentAnswerSchema).parse(active?.lockedAnswers ?? []) : input.answers;
      const graded = gradeAssessmentAnswers(questions, answers);
      const score = graded.reduce((sum, answer) => sum + answer.score, 0);
      const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
      const completedAt = new Date();
      const expired = Boolean(active && assessment.timeLimitMinutes && completedAt.getTime() - active.startedAt.getTime() >= assessment.timeLimitMinutes * 60000);
      const percentage = expired && policy.attemptPolicy ? 0 : maxScore ? Math.round(score * 100 / maxScore) : 0;
      const passed = !expired && percentage >= assessment.passingScore;

      return recordCompletedAssessment(tx,
        { organizationId, assessmentId, userId, ...location, score, maxScore, percentage, passed, completedAt, status: 'completed', ...(graded.some((answer) => answer.reviewPending) ? { reviewPassingScore: expired ? 101 : assessment.passingScore } : {}) },
        freezeGradedAnswers(questions, graded, assessment), location.courseId, assessment.title, active?.id,
        policy.attemptPolicy ? async () => effectiveAssessmentResult(policy.attemptPolicy!,
          await tx.assessmentAttempt.findMany({ where: completedAssessmentAttempts(scope), orderBy: assessmentAttemptOrder,
            select: { id: true, percentage: true, passed: true } }), assessment.passingScore) : undefined);
    });

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
  }

  async recordAnswer(assessmentId: string, userId: string, organizationId: string, attemptId: string, input: AssessmentAnswer | { questionId: string; clear: true }, placementId?: string | null) {
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);
    const location = await this.resolvePlacement(assessment, organizationId, placementId);
    await this.ensureAssessmentIsAvailable(location.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAssessment(tx, assessmentId, organizationId);
      const policy = readAssessmentPolicy(current.policy);
      assertAssessmentWindow(policy);
      const locked = requiresLockedAnswers(policy);
      const active = await tx.assessmentAttempt.findFirst({
        where: { id: attemptId, assessmentId, userId, organizationId, placementId: location.placementId, longreadRevisionId: null, status: 'in_progress', deletedAt: null },
        select: { id: true, startedAt: true, lockedAnswers: true, bankQuestionSnapshot: true },
      });
      if (!active || (current.timeLimitMinutes && Date.now() - active.startedAt.getTime() >= current.timeLimitMinutes * 60000)) {
        throw new BadRequestException('Assessment has no active attempt');
      }

      const questions = active.bankQuestionSnapshot
        ? bankSnapshotSchema.parse(active.bankQuestionSnapshot)
        : await this.getQuestions(assessmentId, organizationId, tx);
      const ordered = current.randomizeOrder && !active.bankQuestionSnapshot ? seededShuffle([...questions], `${assessmentId}:${userId}`) : questions;
      const saved: AssessmentAnswer[] = z.array(draftAssessmentAnswerSchema).parse(active.lockedAnswers ?? []);
      if (!locked) {
        const question = questions.find(({ id }) => id === input.questionId);
        if (!question) throw new BadRequestException('Answer question does not belong to assessment');
        const next = saved.filter(({ questionId }) => questionId !== question.id);
        if (!('clear' in input)) {
          const definition = questionDefinitionSchema.safeParse(question.definition).data;
          const response = input.response;
          if (response?.type === 'matching' && definition?.type === 'matching') {
            const left = new Set(response.pairs.map((pair) => pair.leftId));
            const right = new Set(response.pairs.map((pair) => pair.rightId));
            if (left.size !== response.pairs.length || right.size !== response.pairs.length
              || [...left].some((id) => !definition.left.some((item) => item.id === id))
              || [...right].some((id) => !definition.right.some((item) => item.id === id))) {
              throw new BadRequestException('Invalid matching draft');
            }
          } else if (response?.type === 'ordering' && definition?.type === 'ordering') {
            const picked = response.itemIds.filter(Boolean);
            if (response.itemIds.length > definition.items.length || new Set(picked).size !== picked.length
              || picked.some((id) => !definition.items.some((item) => item.id === id))) {
              throw new BadRequestException('Invalid ordering draft');
            }
          } else {
            gradeAssessmentAnswers([question], [input]);
          }
          next.push(input);
        }
        await tx.assessmentAttempt.updateMany({
          where: { id: active.id, status: 'in_progress' }, data: { lockedAnswers: next },
        });
        return { answer: input };
      }
      if ('clear' in input) throw new BadRequestException('Locked answers cannot be cleared');
      const previous = saved.find((answer) => answer.questionId === input.questionId);
      const question = previous ? ordered.find(({ id }) => id === previous.questionId) : ordered[saved.length];
      if (!question || question.id !== input.questionId) throw new BadRequestException('Answer the current assessment question first');

      const answer = previous ?? input;
      const [grade] = gradeAssessmentAnswers([question], [answer]);
      if (!previous) await tx.assessmentAttempt.update({ where: { id: active.id }, data: { lockedAnswers: [...saved, input] } });
      if (grade.reviewPending || policy.incorrectAnswer !== 'immediate') return { answer };
      return { answer, isCorrect: grade.isCorrect,
        feedback: policy.showFeedback ? (grade.isCorrect ? question.correctFeedback : question.incorrectFeedback) : undefined,
        ...(!grade.isCorrect ? publicAnswerKey(question) : {}) };
    });
  }

  private async lockAssessment(tx: Prisma.TransactionClient, assessmentId: string, organizationId: string) {
    await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    return this.loadAssessmentForAttempt(assessmentId, organizationId, tx);
  }

  private async ensureAttemptAllowed(db: Prisma.TransactionClient, scope: Prisma.AssessmentAttemptWhereInput,
    maxAttempts: number | null, policy: AssessmentPolicy) {
    const completed = { ...completedAssessmentAttempts(scope), status: { in: ['completed', 'pending_review'] as ('completed' | 'pending_review')[] } };
    if (maxAttempts && await db.assessmentAttempt.count({ where: completed }) >= maxAttempts) {
      throw new BadRequestException('Assessment attempts limit reached');
    }
    if (policy.cooldownHours) {
      const previous = await db.assessmentAttempt.findFirst({
        where: { ...completed, completedAt: { gt: new Date(Date.now() - policy.cooldownHours * 3600000) } },
        select: { id: true },
      });
      if (previous) throw new BadRequestException('Assessment retry cooldown is active');
    }
  }

  /**
   * Dry-run grading for the assessment author (admin/instructor): reuses the exact same grading
   * shared gradeAssessmentAnswers logic as createAttempt, so the preview
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
  async startAttempt(assessmentId: string, userId: string, organizationId: string, placementId?: string | null, draft = false, resumeId?: string) {
    const assessment = await this.loadAssessmentForAttempt(assessmentId, organizationId);

    if (!draft && !assessment.bankSampleSize && !assessment.timeLimitMinutes && !requiresLockedAnswers(readAssessmentPolicy(assessment.policy))) {
      throw new BadRequestException('This assessment has no time limit — submit answers directly');
    }

    const location = await this.resolvePlacement(assessment, organizationId, placementId);
    await this.ensureUserExists(userId, organizationId);
    await this.ensureAssessmentIsAvailable(location.courseId, userId, organizationId, assessment.availableAfterCourseCompletion);

    if (resumeId) {
      const existing = await this.prisma.assessmentAttempt.findFirst({ where: {
        id: resumeId, assessmentId, userId, organizationId, placementId: location.placementId,
        longreadRevisionId: null, deletedAt: null,
      }, select: { id: true } });
      if (!existing) throw new NotFoundException('Assessment attempt not found');
      return this.getAttempt(existing.id, { id: userId, organizationId, roles: ['learner'] });
    }

    if (draft || assessment.policy || assessment.bankSampleSize) {
      if (!draft) await this.finalizeExpiredAttempts(assessmentId, organizationId, assessment.timeLimitMinutes);
      const active = await this.prisma.$transaction(async (tx) => {
        const current = await this.lockAssessment(tx, assessmentId, organizationId);
        const policy = readAssessmentPolicy(current.policy);
        assertAssessmentWindow(policy);
        const scope = { assessmentId, userId, organizationId, placementId: location.placementId, longreadRevisionId: null };
        const existing = await tx.assessmentAttempt.findFirst({
          where: { ...scope, status: 'in_progress', deletedAt: null },
          select: { id: true, lockedAnswers: true, bankQuestionSnapshot: true },
        });
        if (existing?.bankQuestionSnapshot) return existing;
        if (existing) {
          const bankQuestionSnapshot = await this.snapshotQuestions(tx, assessmentId, organizationId, userId, current.randomizeOrder);
          return tx.assessmentAttempt.update({
            where: { id: existing.id }, data: { bankQuestionSnapshot, maxScore: bankQuestionSnapshot.reduce((sum, question) => sum + question.points, 0) },
            select: { id: true, lockedAnswers: true, bankQuestionSnapshot: true },
          });
        }
        await this.ensureAttemptAllowed(tx, scope, current.maxAttempts, policy);
        const id = current.bankSampleSize ? randomUUID() : undefined;
        const bankQuestionSnapshot = current.bankSampleSize
          ? await this.sampleQuestions(tx, assessmentId, organizationId, userId, id!, current.bankSampleSize, current.randomizeOrder)
          : await this.snapshotQuestions(tx, assessmentId, organizationId, userId, current.randomizeOrder);
        return tx.assessmentAttempt.create({
          data: { ...(id ? { id } : {}), organizationId, assessmentId, userId, ...location, status: 'in_progress', startedAt: new Date(),
            bankQuestionSnapshot, maxScore: bankQuestionSnapshot.reduce((sum, question) => sum + question.points, 0),
          },
          select: { id: true, lockedAnswers: true, bankQuestionSnapshot: true },
        });
      });
      const attempt = await this.getAttempt(active.id, { id: userId, organizationId, roles: ['learner'] });
      return {
        ...attempt,
        lockedAnswers: z.array(draftAssessmentAnswerSchema).parse(active.lockedAnswers ?? []),
        ...(active.bankQuestionSnapshot ? { questions: publicSample(active.bankQuestionSnapshot, assessmentId, organizationId, userId, assessment.randomizeOrder) } : {}),
      };
    }

    // SELECT ... FOR UPDATE takes the same lock deleteAssessment() takes before soft-deleting,
    // so the two are fully serialized: whichever of the two transactions acquires the lock
    // first, the other only proceeds once it's committed and can see the up-to-date row.
    // PR 584: the resume check and the attempts limit run under that lock, so two parallel starts cannot both pass the limit.
    const attemptId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM assessments
        WHERE id = ${assessmentId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!rows[0]) {
        throw new NotFoundException('Assessment not found');
      }

      const existing = await tx.assessmentAttempt.findFirst({
        where: { assessmentId, userId, organizationId, placementId: location.placementId, longreadRevisionId: null, status: 'in_progress', deletedAt: null },
        select: { id: true },
      });
      if (existing) return existing.id;

      await this.ensureAttemptsLimit(assessmentId, userId, organizationId, assessment.maxAttempts, location.placementId, tx);
      const bankQuestionSnapshot = await this.snapshotQuestions(tx, assessmentId, organizationId, userId, assessment.randomizeOrder);
      const attempt = await tx.assessmentAttempt.create({
        data: { organizationId, assessmentId, userId, ...location, status: 'in_progress', startedAt: new Date(),
          bankQuestionSnapshot, maxScore: bankQuestionSnapshot.reduce((sum, question) => sum + question.points, 0) },
        select: { id: true },
      });

      return attempt.id;
    });

    return this.getAttempt(attemptId, { id: userId, organizationId, roles: ['learner'] });
  }

  private async resolvePlacement(assessment: { id: string; courseId: string | null }, organizationId: string, placementId?: string | null) {
    if (placementId === null || (placementId === undefined && !assessment.courseId)) {
      return { placementId: null, courseId: null };
    }
    const placement = await this.prisma.assessmentPlacement.findFirst({
      where: {
        assessmentId: assessment.id, organizationId, deletedAt: null, longreadBlockId: null,
        course: { deletedAt: null },
        ...(placementId ? { id: placementId, course: { deletedAt: null, status: 'published' } } : { legacy: true }),
      },
      select: { id: true, courseId: true },
    });
    if (!placement?.courseId) throw new NotFoundException('Assessment placement not found');
    return { placementId: placement.id, courseId: placement.courseId };
  }

  private async loadAssessmentForAttempt(assessmentId: string, organizationId: string, db: Prisma.TransactionClient = this.prisma) {
    const assessment = await db.assessment.findFirst({
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
        passMessage: true,
        presentation: true,
        failMessage: true,
        showCorrectAnswers: true,
        maxAttempts: true,
        timeLimitMinutes: true,
        randomizeOrder: true,
        policy: true,
        bankSampleSize: true,
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
      select: { id: true, timeLimitMinutes: true, bankSampleSize: true },
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

  private async ensureAssessmentIsAvailable(courseId: string | null, userId: string, organizationId: string, availableAfterCourseCompletion: boolean) {
    if (!courseId || !availableAfterCourseCompletion) {
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

  private async ensureAttemptsLimit(assessmentId: string, userId: string, organizationId: string, maxAttempts: number | null, placementId: string | null, db: Prisma.TransactionClient = this.prisma) {
    if (!maxAttempts) {
      return;
    }

    const attemptsCount = await db.assessmentAttempt.count({
      where: {
        assessmentId,
        placementId,
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

  private async snapshotQuestions(db: Prisma.TransactionClient, assessmentId: string, organizationId: string, userId: string, shuffle: boolean) {
    const questions = await this.getQuestions(assessmentId, organizationId, db);
    const ordered = shuffle ? seededShuffle(questions, `${assessmentId}:${userId}`) : questions;
    return ordered.map((question) => bankSnapshotSchema.element.strip().parse(question));
  }

  private async sampleQuestions(db: Prisma.TransactionClient, assessmentId: string, organizationId: string,
    userId: string, attemptId: string, size: number, shuffle: boolean) {
    const questions = await this.getQuestions(assessmentId, organizationId, db, true);
    const candidates = questions.filter((question) => question.bankSampleCandidate);
    if (candidates.length < size) throw new BadRequestException('The question bank has too few sample questions');
    const seed = `${assessmentId}:${userId}:${attemptId}`;
    const chosen = [...questions.filter((question) => !question.bankSampleCandidate), ...seededShuffle(candidates, seed).slice(0, size)];
    return (shuffle ? seededShuffle(chosen, seed) : chosen).map((question, order) => bankSnapshotSchema.element.strip().parse({ ...question, order }));
  }

  private async getQuestions(assessmentId: string, organizationId: string, db: Prisma.TransactionClient = this.prisma, includeCandidates = false) {
    const questions = await db.assessmentQuestion.findMany({
      where: {
        assessmentId,
        organizationId,
        deletedAt: null,
        ...(!includeCandidates ? { bankSampleCandidate: false } : {}),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        bankSampleCandidate: true,
        title: true,
        text: true,
        imageUrl: true, material: true,
        order: true,
        type: true,
        points: true,
        scoringMode: true,
        definition: true,
        correctFeedback: true,
        incorrectFeedback: true,
        options: {
          where: { deletedAt: null },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            order: true,
            isCorrect: true,
            text: true,
            imageUrl: true, material: true,
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

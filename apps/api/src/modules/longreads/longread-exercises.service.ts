import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { submitExerciseSchema } from '@lms/shared/longread-exercises';
import { assessmentAnswerSchema, type AssessmentAnswer } from '@lms/shared/assessment-question-types';
import { gradeAssessmentAnswers } from '../../common/assessment-grading.js';
import { recordCompletedAssessment } from '../../common/assessment-recording.js';
import { stableJson } from '../../common/stable-json.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';
import { LongreadReaderService } from './longread-reader.service.js';
import { LongreadsService } from './longreads.service.js';
import { captureExerciseQuestions, visibleExercises, type ExerciseSnapshotBlock } from './longread-exercise-snapshot.js';
import type { SnapshotChapter } from './longread-publish-check.js';

const componentInclude = { answers: true } as const;
type ComponentAttempt = Prisma.AssessmentAttemptGetPayload<{ include: typeof componentInclude }>;
function answerHash(answer: AssessmentAnswer) {
  const response = answer.response;
  const canonical = { ...answer, ...(answer.selectedOptionIds ? { selectedOptionIds: [...answer.selectedOptionIds].sort() } : {}),
    ...(response?.type === 'matching' ? { response: { ...response, pairs: [...response.pairs].sort((a, b) => a.leftId.localeCompare(b.leftId, 'en')) } } : {}),
    ...(response?.type === 'fill_blank' ? { response: { ...response, blanks: [...response.blanks].sort((a, b) => a.blankId.localeCompare(b.blankId, 'en')) } } : {}) };
  return createHash('sha256').update(stableJson(canonical)).digest('hex');
}
function result(attempt: ComponentAttempt, block: ExerciseSnapshotBlock) {
  const answer = attempt.answers[0];
  const own = answer ? assessmentAnswerSchema.safeParse({ questionId: answer.questionId, selectedOptionId: answer.selectedOptionId ?? undefined, selectedOptionIds: answer.selectedOptionIds ?? undefined, response: answer.response ?? undefined }) : null;
  return { ...(own?.success ? { answer: own.data } : {}), attemptId: attempt.id, attempt: attempt.longreadSequence!, score: attempt.score, maxScore: attempt.maxScore, percentage: attempt.percentage,
    passed: attempt.passed, isCorrect: answer?.isCorrect ?? false,
    ...(block.content.feedback === 'answers' ? { correctDefinition: block.question.definition, correctOptionIds: block.question.options.filter((option) => option.isCorrect).map((option) => option.id) } : {}) };
}

@Injectable()
export class LongreadExercisesService {
  constructor(private readonly prisma: PrismaService, private readonly reader: LongreadReaderService, private readonly drafts: LongreadsService) {}

  private async context(lessonId: string, actor: CurrentUser, version: number) {
    const view = await this.reader.read(lessonId, actor);
    if (view.version !== version) throw new ConflictException('Longread version changed');
    const progress = await this.prisma.progress.findFirst({ where: { lessonId, userId: actor.id, organizationId: actor.organizationId, deletedAt: null,
      longreadRevision: { organizationId: actor.organizationId, number: version, document: { lessonId, organizationId: actor.organizationId } } }, select: { id: true } });
    if (!progress) throw new NotFoundException('Longread not found');
    const available = new Set(view.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id).filter((id): id is string => !!id)));
    return { progressId: progress.id, available };
  }

  private async locked(tx: Prisma.TransactionClient, progressId: string, lessonId: string, actor: CurrentUser, version: number) {
    await tx.$queryRaw`SELECT id FROM progress WHERE id = ${progressId}::uuid FOR UPDATE`;
    const progress = await tx.progress.findFirst({ where: { id: progressId, lessonId, organizationId: actor.organizationId, userId: actor.id, deletedAt: null }, include: { longreadRevision: true, lesson: { select: { status: true, deletedAt: true } } } });
    if (!progress?.longreadRevision || progress.longreadRevision.number !== version || progress.lesson?.status !== 'published' || progress.lesson.deletedAt) throw new NotFoundException('Longread not found');
    return { progress, revision: progress.longreadRevision, blocks: visibleExercises(progress.longreadRevision.snapshot as unknown as SnapshotChapter[]) };
  }

  async states(lessonId: string, actor: CurrentUser, version: number) {
    const scope = await this.context(lessonId, actor, version);
    return this.prisma.$transaction(async (tx) => {
      const { revision, blocks } = await this.locked(tx, scope.progressId, lessonId, actor, version);
      const attempts = await tx.assessmentAttempt.findMany({ where: { organizationId: actor.organizationId, userId: actor.id, longreadRevisionId: revision.id, deletedAt: null }, include: componentInclude, orderBy: { longreadSequence: 'asc' } });
      const tests = [...new Map(blocks.filter((block) => block.content.mode === 'graded').map((block) => [block.question.assessment.id, block.question.assessment])).values()].map((assessment) => {
        const finals = attempts.filter((attempt) => attempt.assessmentId === assessment.id && attempt.countsTowardResults);
        const graded = blocks.filter((block) => block.content.mode === 'graded' && block.question.assessment.id === assessment.id);
        const answered = new Set(attempts.filter((attempt) => !attempt.countsTowardResults).map((attempt) => attempt.longreadBlockId));
        return { ...assessment, attemptsUsed: finals.length, remaining: assessment.maxAttempts === null ? null : Math.max(0, assessment.maxAttempts - finals.length),
          requiredRemaining: graded.filter((block) => block.content.required && !answered.has(block.id)).length,
          latest: finals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ? (() => { const value = finals[0]!; return { attemptId: value.id, score: value.score, maxScore: value.maxScore, percentage: value.percentage, passed: value.passed }; })() : null };
      });
      return { version, exercises: blocks.filter((block) => scope.available.has(block.id)).map((block) => {
        const rows = attempts.filter((attempt) => attempt.longreadBlockId === block.id);
        const last = rows.at(-1);
        return { blockId: block.id, attemptsUsed: rows.length, nextAttempt: rows.length + 1, remaining: Math.max(0, block.content.maxAttempts - rows.length),
          testExhausted: block.content.mode === 'graded' && tests.find((test) => test.id === block.question.assessment.id)?.remaining === 0,
          lastResult: last ? result(last, block) : null };
      }), tests };
    });
  }

  async submit(lessonId: string, blockId: string, actor: CurrentUser, raw: unknown) {
    const input = submitExerciseSchema.parse(raw), scope = await this.context(lessonId, actor, input.version);
    if (!scope.available.has(blockId)) throw new NotFoundException('Exercise not found');
    const accepted = await this.prisma.$transaction(async (tx) => {
      const { progress, revision, blocks } = await this.locked(tx, scope.progressId, lessonId, actor, input.version);
      const block = blocks.find((candidate) => candidate.id === blockId);
      if (!block) throw new NotFoundException('Exercise not found');
      if (input.answer.questionId !== block.question.id) throw new BadRequestException('Question does not belong to exercise');
      const rows = await tx.assessmentAttempt.findMany({ where: { organizationId: actor.organizationId, userId: actor.id, longreadRevisionId: revision.id, longreadBlockId: block.id, deletedAt: null }, include: componentInclude, orderBy: { longreadSequence: 'asc' } });
      const hash = answerHash(input.answer), replay = rows.find((row) => row.longreadRequestId === input.requestId);
      if (replay) { if (replay.longreadRequestHash !== hash || replay.longreadSequence !== input.expectedAttempt) throw new ConflictException('Request id reused with another answer'); return { acceptedAttemptId: replay.id, acceptedResult: result(replay, block) }; }
      const sameSequence = rows.find((row) => row.longreadSequence === input.expectedAttempt);
      if (sameSequence) { if (sameSequence.longreadRequestHash !== hash) throw new ConflictException('Exercise attempt changed'); return { acceptedAttemptId: sameSequence.id, acceptedResult: result(sameSequence, block) }; }
      if (rows.length >= block.content.maxAttempts) throw new UnprocessableEntityException('Exercise attempts exhausted');
      if (input.expectedAttempt !== rows.length + 1) throw new ConflictException('Exercise attempt changed');
      if (block.content.mode === 'graded' && block.question.assessment.maxAttempts !== null) {
        const finals = await tx.assessmentAttempt.count({ where: { organizationId: actor.organizationId, userId: actor.id, assessmentId: block.question.assessment.id, longreadRevisionId: revision.id, countsTowardResults: true, deletedAt: null } });
        if (finals >= block.question.assessment.maxAttempts) throw new UnprocessableEntityException('Test attempts exhausted');
      }
      const graded = gradeAssessmentAnswers([block.question], [input.answer])[0]!;
      const percentage = Math.round(graded.score / block.question.points * 100);
      const id = await recordCompletedAssessment(tx, { organizationId: actor.organizationId, userId: actor.id, assessmentId: block.question.assessment.id, status: 'completed',
        score: graded.score, maxScore: block.question.points, percentage, passed: percentage >= block.content.passingScore, completedAt: new Date(), countsTowardResults: false,
        longreadRevisionId: revision.id, longreadBlockId: block.id, longreadSequence: input.expectedAttempt, longreadRequestId: input.requestId, longreadRequestHash: hash,
        longreadMetadata: { lessonId, version: input.version, title: block.question.assessment.title, passingScore: block.question.assessment.passingScore } },
      [{ ...graded, frozenQuestion: { question: block.question, revealAnswers: block.content.feedback === 'answers', blockId: block.id } as unknown as Prisma.InputJsonValue }], progress.courseId, block.question.assessment.title);
      return { acceptedAttemptId: id, acceptedResult: result(await tx.assessmentAttempt.findUniqueOrThrow({ where: { id }, include: componentInclude }), block) };
    });
    return { ...await this.states(lessonId, actor, input.version), ...accepted };
  }

  async finish(lessonId: string, actor: CurrentUser, version: number, assessmentId: string) {
    const scope = await this.context(lessonId, actor, version);
    const attemptId = await this.prisma.$transaction(async (tx) => {
      const { progress, revision, blocks } = await this.locked(tx, scope.progressId, lessonId, actor, version);
      const graded = blocks.filter((block) => block.content.mode === 'graded' && block.question.assessment.id === assessmentId);
      if (!graded.length || !graded.some((block) => scope.available.has(block.id))) throw new NotFoundException('Longread test not found');
      const assessment = graded[0]!.question.assessment;
      const rows = await tx.assessmentAttempt.findMany({ where: { organizationId: actor.organizationId, userId: actor.id, longreadRevisionId: revision.id, assessmentId, deletedAt: null }, include: componentInclude, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }] });
      const best = graded.map((block) => ({ block, attempt: rows.find((row) => row.longreadBlockId === block.id) }));
      if (best.some(({ block, attempt }) => block.content.required && !attempt)) throw new UnprocessableEntityException('Required exercises must be answered');
      if (!best.some(({ attempt }) => !!attempt)) throw new UnprocessableEntityException('Answer an exercise before finishing');
      const fingerprint = createHash('sha256').update(stableJson(best.map(({ block, attempt }) => [block.id, attempt?.id ?? null]))).digest('hex');
      const previous = rows.find((row) => row.countsTowardResults && row.longreadResultKey === fingerprint);
      if (previous) return previous.id;
      if (assessment.maxAttempts !== null && rows.filter((row) => row.countsTowardResults).length >= assessment.maxAttempts) throw new UnprocessableEntityException('Test attempts exhausted');
      const maxScore = graded.reduce((sum, block) => sum + block.question.points, 0), score = best.reduce((sum, item) => sum + (item.attempt?.score ?? 0), 0);
      if (maxScore > 2147483647) throw new BadRequestException('Test score exceeds storage limit');
      const percentage = Math.round(score / maxScore * 100), passed = percentage >= assessment.passingScore && best.every(({ block, attempt }) => !block.content.required || attempt?.passed);
      return recordCompletedAssessment(tx, { organizationId: actor.organizationId, userId: actor.id, assessmentId, status: 'completed', score, maxScore, percentage, passed, completedAt: new Date(),
        longreadRevisionId: revision.id, longreadResultKey: fingerprint, longreadMetadata: { lessonId, version, title: assessment.title, passingScore: assessment.passingScore } },
      best.flatMap(({ attempt }) => attempt?.answers.map((answer) => ({ questionId: answer.questionId, selectedOptionId: answer.selectedOptionId,
        selectedOptionIds: answer.selectedOptionIds ?? undefined, response: answer.response ?? undefined, score: answer.score, isCorrect: answer.isCorrect, frozenQuestion: answer.frozenQuestion ?? undefined })) ?? []), progress.courseId, assessment.title);
    });
    return { attemptId, state: await this.states(lessonId, actor, version) };
  }

  async preview(lessonId: string, blockId: string, organizationId: string, draftRevision: number, answer: AssessmentAnswer) {
    const draft = await this.drafts.getDraft(lessonId, organizationId);
    if (draft.revision !== draftRevision) throw new ConflictException('Preview draft changed');
    const captured = await captureExerciseQuestions(this.prisma, lessonId, organizationId, draft.chapters);
    const block = visibleExercises(captured.chapters).find((item) => item.id === blockId);
    if (!block) throw new NotFoundException('Exercise not found');
    const graded = gradeAssessmentAnswers([block.question], [answer])[0]!;
    const percentage = Math.round(graded.score / block.question.points * 100);
    return { answer, preview: true, score: graded.score, maxScore: block.question.points, percentage, isCorrect: graded.isCorrect, passed: percentage >= block.content.passingScore,
      ...(block.content.feedback === 'answers' ? { correctDefinition: block.question.definition, correctOptionIds: block.question.options.filter((option) => option.isCorrect).map((option) => option.id) } : {}) };
  }
}

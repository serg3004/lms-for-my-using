/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AssessmentAnswer, QuestionDefinition, QuestionResponse } from '@lms/shared/assessment-question-types';
import { exerciseContentSchema, writeLongreadQuestionSchema } from '@lms/shared/longread-exercises';
import { ReportsService } from '../modules/reports/reports.service.js';
import { ProgressService } from '../modules/progress/progress.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { LongreadsService } from '../modules/longreads/longreads.service.js';
import { LongreadVersionsService } from '../modules/longreads/longread-versions.service.js';
import { LongreadReaderService } from '../modules/longreads/longread-reader.service.js';
import { LongreadExercisesService } from '../modules/longreads/longread-exercises.service.js';
import { LongreadQuestionBankService } from '../modules/longreads/longread-question-bank.service.js';
import { LongreadsController } from '../modules/longreads/longreads.controller.js';
import { AssessmentResultsService } from '../modules/assessment-attempts/assessment-results.service.js';
import { AssessmentAttemptsService } from '../modules/assessment-attempts/assessment-attempts.service.js';
import { RolesGuard, type CurrentUser, type AuthenticatedRequest } from '../modules/auth/public.js';
import { CourseAccessGuard, CourseAccessPolicy } from '../modules/course-access/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';
const items = [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }];
const definitions: QuestionDefinition[] = [
  { type: 'true_false', correctAnswer: true },
  { type: 'matching', left: items, right: items, correctPairs: [{ leftId: 'a', rightId: 'b' }, { leftId: 'b', rightId: 'a' }] },
  { type: 'ordering', items, correctOrder: ['b', 'a'] },
  { type: 'fill_blank', blanks: [{ id: 'city', acceptedAnswers: ['Алматы'] }], caseSensitive: false, whitespace: 'trim' },
  { type: 'short_answer', acceptedAnswers: ['Café'], caseSensitive: false, whitespace: 'trim' },
];
const correct: QuestionResponse[] = [{ type: 'true_false', value: true }, { type: 'matching', pairs: [{ leftId: 'a', rightId: 'b' }, { leftId: 'b', rightId: 'a' }] }, { type: 'ordering', itemIds: ['b', 'a'] }, { type: 'fill_blank', blanks: [{ blankId: 'city', value: ' АЛМАТЫ ' }] }, { type: 'short_answer', text: ' CAFE\u0301 ' }];
const wrong: QuestionResponse[] = [{ type: 'true_false', value: false }, { type: 'matching', pairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'b' }] }, { type: 'ordering', itemIds: ['a', 'b'] }, { type: 'fill_blank', blanks: [{ blankId: 'city', value: 'x' }] }, { type: 'short_answer', text: 'x' }];
describe('longread versioned exercises (PR 389) — database', () => {
  const prisma = new PrismaService(), drafts = new LongreadsService(prisma), versions = new LongreadVersionsService(prisma, drafts), reader = new LongreadReaderService(prisma, versions, drafts), exercises = new LongreadExercisesService(prisma, reader, drafts), bank = new LongreadQuestionBankService(prisma, drafts), results = new AssessmentResultsService(prisma), attempts = new AssessmentAttemptsService(prisma);
  const controller = new LongreadsController(drafts, versions, reader, exercises, bank);
  let ready = false, org = '', foreignOrg = '', courseId: string, lessonId: string, assessmentId: string;
  let learner: CurrentUser, second: CurrentUser, outsider: CurrentUser, admin: CurrentUser, instructor: CurrentUser, unassigned: CurrentUser, foreign: CurrentUser;
  let blocks: string[], good: AssessmentAnswer[], bad: AssessmentAnswer[];
  async function person(roles: CurrentUser['roles'], organizationId = org): Promise<CurrentUser> {
    const p = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Exercise', lastName: 'Synthetic', passwordHash: 'unused' } });
    await prisma.membership.createMany({ data: roles.map((role) => ({ organizationId, userId: p.id, role })) }); return { ...p, roles };
  }
  async function guard(actor: CurrentUser, handler: (...args: never[]) => unknown) {
    const req = { currentUser: actor, params: { id: lessonId } } as unknown as AuthenticatedRequest;
    const ctx = { getHandler: () => handler, getClass: () => LongreadsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(ctx); await new CourseAccessGuard(new Reflector(), new CourseAccessPolicy(prisma)).canActivate(ctx); return req;
  }
  const submit = (index: number, expectedAttempt = 1, answer = good[index]!, actor = learner, version = 1, requestId = randomUUID()) => exercises.submit(lessonId, blocks[index]!, actor, { version, expectedAttempt, requestId, answer });
  async function answerAll() { for (let i = 0; i < 7; i++) await submit(i); }
  beforeAll(async () => { assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' }); await prisma.$connect(); ready = true; });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    org = ''; foreignOrg = '';
    org = (await prisma.organization.create({ data: { name: 'Exercises', slug: `exercise-${randomUUID()}`, longreadEnabled: true } })).id;
    foreignOrg = (await prisma.organization.create({ data: { name: 'Foreign', slug: `foreign-${randomUUID()}`, longreadEnabled: true } })).id;
    learner = await person(['learner']); second = await person(['learner']); outsider = await person(['learner']); admin = await person(['admin']); instructor = await person(['instructor']); unassigned = await person(['instructor']); foreign = await person(['admin'], foreignOrg);
    courseId = (await prisma.course.create({ data: { organizationId: org, title: 'Exercise course', slug: `course-${randomUUID()}`, status: 'published' } })).id;
    await prisma.courseInstructor.create({ data: { organizationId: org, courseId, instructorId: instructor.id } });
    await prisma.assignment.createMany({ data: [learner, second].map((u) => ({ organizationId: org, userId: u.id, courseId })) });
    lessonId = (await prisma.lesson.create({ data: { organizationId: org, courseId, title: 'Seven exercises', slug: `lesson-${randomUUID()}`, type: 'longread' } })).id;
    await prisma.$transaction((tx) => drafts.createForLesson(tx, org, lessonId));
    const qids: string[] = [];
    for (const [index, type] of ['single_choice', 'multiple_choice', ...definitions.map((d) => d.type)].entries()) {
      const d = await drafts.getDraft(lessonId, org);
      const created = await bank.save(lessonId, org, d.revision, writeLongreadQuestionSchema.parse({ type, title: `Question ${index}`, definition: index >= 2 ? definitions[index - 2] : null, options: index < 2 ? [{ text: 'Good', isCorrect: true }, { text: 'Bad', isCorrect: false }] : [], assessmentMaxAttempts: 2 }));
      qids.push(created.questionId);
    }
    const papers = await bank.list(lessonId, org); assessmentId = papers[0]!.id;
    const qs = qids.map((id) => papers[0]!.questions.find((q) => q.id === id)!);
    good = qs.map((q, i) => i >= 2 ? { questionId: q.id, response: correct[i - 2]! } : i === 1 ? { questionId: q.id, selectedOptionIds: [q.options[0]!.id] } : { questionId: q.id, selectedOptionId: q.options[0]!.id });
    bad = qs.map((q, i) => i >= 2 ? { questionId: q.id, response: wrong[i - 2]! } : i === 1 ? { questionId: q.id, selectedOptionIds: [q.options[1]!.id] } : { questionId: q.id, selectedOptionId: q.options[1]!.id });
    good.push(good[0]!); bad.push(bad[0]!);
    const d = await drafts.getDraft(lessonId, org);
    const saved = await drafts.saveDraft(lessonId, org, { revision: d.revision, settings: { ...d.settings, readingOrder: 'free' }, chapters: [{ id: d.chapters[0]!.id, title: 'Exercises', hidden: false,
      blocks: [...qids, qids[0]!].map((questionId, i) => ({ type: 'exercise', schemaVersion: 1, content: exerciseContentSchema.parse({ questionId, weight: 8, mode: i === 7 ? 'practice' : 'graded', feedback: i === 0 ? 'answers' : 'result', maxAttempts: 3 }) })) }] }, admin.id);
    blocks = saved.chapters[0]!.blocks.map((b) => b.id); await versions.publish(lessonId, org, saved.revision, admin.id);
  });
  afterEach(async () => {
    if (!ready || !org) return;
    const ids = [org, foreignOrg].filter(Boolean), where = { organizationId: { in: ids } };
    await prisma.certificate.deleteMany({ where }); await prisma.notification.deleteMany({ where }); await prisma.assessmentAttemptAnswer.deleteMany({ where }); await prisma.assessmentAttempt.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where }); await prisma.progress.deleteMany({ where }); await prisma.longreadDocument.updateMany({ where, data: { publishedRevisionId: null } }); await prisma.longreadRevision.deleteMany({ where });
    await prisma.longreadBlock.deleteMany({ where }); await prisma.longreadChapter.deleteMany({ where }); await prisma.longreadDocument.deleteMany({ where });
    await prisma.assessmentAnswerOption.deleteMany({ where }); await prisma.assessmentQuestion.deleteMany({ where }); await prisma.assessment.deleteMany({ where });
    await prisma.courseMaterial.deleteMany({ where });
    await prisma.lesson.deleteMany({ where }); await prisma.assignment.deleteMany({ where }); await prisma.courseInstructor.deleteMany({ where }); await prisma.course.deleteMany({ where });
    await prisma.membership.deleteMany({ where }); await prisma.user.deleteMany({ where }); await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  });
  it('grades and persists correct and incorrect answers for all seven types without exposing keys before checking', async () => {
    const view = await reader.read(lessonId, learner);
    expect(JSON.stringify(view)).not.toMatch(/correctAnswer|correctPairs|correctOrder|acceptedAnswers|isCorrect/);
    for (let i = 0; i < 7; i++) {
      const failed = await submit(i, 1, bad[i]); expect(failed.exercises[i]!.lastResult).toMatchObject({ score: 0, passed: false, isCorrect: false });
      const passed = await submit(i, 2); expect(passed.exercises[i]!.lastResult).toMatchObject({ score: 8, maxScore: 8, passed: true, isCorrect: true, answer: good[i] });
      if (i > 0) expect(passed.exercises[i]!.lastResult).not.toHaveProperty('correctDefinition');
    }
    expect(await prisma.assessmentAttemptAnswer.count({ where: { organizationId: org } })).toBe(14);
    expect((await exercises.states(lessonId, learner, 1)).exercises[0]!.lastResult?.correctOptionIds).toEqual([good[0]!.selectedOptionId]);
    expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
  });
  it('makes preview entirely side-effect free and applies the author/course guards', async () => {
    const d = await drafts.getDraft(lessonId, org), before = await prisma.progress.count({ where: { organizationId: org } });
    for (let i = 0; i < 7; i++) expect(await controller.previewExercise(lessonId, blocks[i]!, { revision: d.revision, answer: good[i] }, await guard(instructor, controller.previewExercise))).toMatchObject({ preview: true, score: 8 });
    expect(await prisma.progress.count({ where: { organizationId: org } })).toBe(before); expect(await prisma.assessmentAttempt.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.notification.count({ where: { organizationId: org } })).toBe(0); expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
    await expect(guard(learner, controller.saveQuestion)).rejects.toBeInstanceOf(ForbiddenException); await expect(guard(unassigned, controller.previewExercise)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.questions(lessonId, await guard(foreign, controller.questions))).rejects.toBeInstanceOf(NotFoundException);
    await expect(exercises.preview(lessonId, blocks[0]!, org, d.revision - 1, good[0]!)).rejects.toBeInstanceOf(ConflictException);
  });
  it('serializes same/different request ids from two tabs and consumes one slot for the same expected attempt', async () => {
    const id = randomUUID(), first = await Promise.all([submit(0, 1, good[0], learner, 1, id), submit(0, 1, good[0], learner, 1, id)]);
    expect(first[0]!.acceptedAttemptId).toBe(first[1]!.acceptedAttemptId);
    const replay = await submit(0); expect(replay.acceptedAttemptId).toBe(first[0]!.acceptedAttemptId);
    await expect(submit(0, 1, bad[0])).rejects.toBeInstanceOf(ConflictException);
    await expect(submit(0, 1, bad[0], learner, 1, id)).rejects.toBeInstanceOf(ConflictException);
    await submit(0, 2); const old = await submit(0, 1, good[0], learner, 1, id); expect(old.acceptedAttemptId).toBe(first[0]!.acceptedAttemptId);
    await submit(0, 3); expect((await exercises.states(lessonId, learner, 1)).exercises[0]).toMatchObject({ attemptsUsed: 3, remaining: 0 });
    await expect(submit(0, 4)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(await prisma.assessmentAttempt.count({ where: { organizationId: org } })).toBe(3);
  });
  it('rejects different concurrent answers for one slot and saves the next slot after a reload', async () => {
    const concurrent = await Promise.allSettled([submit(2), submit(2, 1, bad[2])]);
    expect(concurrent.filter((v) => v.status === 'fulfilled')).toHaveLength(1); expect(concurrent.filter((v) => v.status === 'rejected')).toHaveLength(1);
    expect((await exercises.states(lessonId, learner, 1)).exercises[2]).toMatchObject({ attemptsUsed: 1, nextAttempt: 2 });
    await submit(2, 2); expect((await exercises.states(lessonId, learner, 1)).exercises[2]!.lastResult?.passed).toBe(true);
  });
  it('excludes practice/components from normal results and creates one final result/certificate/notification for concurrent finishes', async () => {
    await submit(7); expect(await attempts.listAttempts(assessmentId, org)).toEqual([]); expect(await results.listAssessmentResults(assessmentId, org)).toEqual([]);
    const component = await prisma.assessmentAttempt.findFirstOrThrow({ where: { organizationId: org } });
    await expect(results.getAttemptResult(component.id, learner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(exercises.finish(lessonId, learner, 1, assessmentId)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await answerAll(); const [a, b] = await Promise.all([exercises.finish(lessonId, learner, 1, assessmentId), exercises.finish(lessonId, learner, 1, assessmentId)]);
    expect(a.attemptId).toBe(b.attemptId); const report = await results.getAttemptResult(a.attemptId, learner);
    expect(report).toMatchObject({ score: 56, maxScore: 56, percentage: 100, passed: true, longread: { lessonId, version: 1 } }); expect(report.answers).toHaveLength(7);
    expect((await results.listAssessmentResults(assessmentId, org))).toHaveLength(1);
    expect(await prisma.certificate.count({ where: { organizationId: org, assessmentAttemptId: a.attemptId } })).toBe(1);
    expect(await prisma.notification.count({ where: { organizationId: org } })).toBe(1);
    expect((await prisma.notification.findFirstOrThrow({ where: { organizationId: org } })).link).toBe(`/learn/attempts/${a.attemptId}`);
  });
  it('retains old keys, labels and grades after editing/deleting sources and republishing; reports distinguish versions', async () => {
    await answerAll(); const old = await exercises.finish(lessonId, learner, 1, assessmentId), frozen = await results.getAttemptResult(old.attemptId, learner);
    await prisma.assessmentQuestion.update({ where: { id: good[6]!.questionId }, data: { definition: { ...definitions[4], acceptedAnswers: ['changed'] }, title: 'EDITED' } });
    await prisma.assessmentAnswerOption.update({ where: { id: good[0]!.selectedOptionId }, data: { text: 'EDITED OPTION', isCorrect: false } });
    await prisma.assessmentAnswerOption.updateMany({ where: { questionId: good[0]!.questionId, id: { not: good[0]!.selectedOptionId } }, data: { isCorrect: true } });
    const d = await drafts.getDraft(lessonId, org); expect(await versions.publish(lessonId, org, d.revision, admin.id)).toMatchObject({ version: 2 });
    expect((await reader.read(lessonId, learner)).version).toBe(1); expect((await reader.read(lessonId, second)).version).toBe(2);
    expect((await submit(6, 2)).exercises[6]!.lastResult?.score).toBe(8);
    expect((await submit(6, 1, good[6], second, 2)).exercises[6]!.lastResult?.score).toBe(0);
    for (let i = 0; i < 6; i++) await submit(i, 1, good[i], second, 2);
    await exercises.finish(lessonId, second, 2, assessmentId);
    await prisma.assessmentQuestion.updateMany({ where: { assessmentId }, data: { deletedAt: new Date() } });
    expect(await results.getAttemptResult(old.attemptId, learner)).toEqual(frozen);
    expect((await results.getAssessmentReport(assessmentId, org)).versions?.map((v) => v.version).sort()).toEqual([1, 2]);
    expect((await submit(0, 2)).exercises[0]!.lastResult?.score).toBe(8);
  });
  it('restores a published answer key into an independent draft without mutating historical questions', async () => {
    await prisma.assessmentQuestion.update({ where: { id: good[6]!.questionId }, data: { deletedAt: new Date(), definition: { ...definitions[4], acceptedAnswers: ['changed'] } } });
    const d = await drafts.getDraft(lessonId, org), restored = await versions.restoreVersion(lessonId, org, 1, d.revision, admin.id);
    const ref = restored.chapters[0]!.blocks[6]!.content as { questionId: string }; expect(ref.questionId).not.toBe(good[6]!.questionId);
    expect((await prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: ref.questionId } })).definition).toEqual(definitions[4]);
    expect((await versions.publishCheck(lessonId, org)).ok).toBe(true);
    expect(await exercises.preview(lessonId, restored.chapters[0]!.blocks[6]!.id, org, restored.revision, { ...good[6]!, questionId: ref.questionId })).toMatchObject({ score: 8 });
  });
  it('rejects forged block/question/version/organization, revoked entitlement, disabled flag and stale bank writes', async () => {
    await expect(exercises.submit(lessonId, randomUUID(), learner, { version: 1, requestId: randomUUID(), expectedAttempt: 1, answer: good[0] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(submit(0, 1, good[6])).rejects.toThrow('Question does not belong');
    await expect(submit(0, 1, good[0], learner, 2)).rejects.toBeInstanceOf(ConflictException);
    await expect(submit(0, 1, good[0], foreign)).rejects.toBeInstanceOf(NotFoundException);
    await expect(submit(0, 1, good[0], outsider)).rejects.toBeInstanceOf(NotFoundException);
    const d = await drafts.getDraft(lessonId, org); await expect(bank.save(lessonId, org, d.revision - 1, writeLongreadQuestionSchema.parse({ type: 'short_answer', title: 'new', definition: definitions[4] }))).rejects.toBeInstanceOf(ConflictException);
    await prisma.assignment.updateMany({ where: { userId: learner.id, courseId }, data: { status: 'cancelled' } }); await expect(submit(0)).rejects.toBeInstanceOf(NotFoundException);
    await prisma.organization.update({ where: { id: org }, data: { longreadEnabled: false } }); await expect(submit(0, 1, good[0], second)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.assessmentAttempt.count({ where: { organizationId: org } })).toBe(0);
  });


  it('writes an existing bank question with optimistic revision/updatedAt while preserving option ids and pinned keys', async () => {
    await reader.read(lessonId, learner);
    const paper = (await bank.list(lessonId, org))[0]!, question = paper.questions.find((q) => q.id === good[0]!.questionId)!;
    const draft = await drafts.getDraft(lessonId, org);
    const input = writeLongreadQuestionSchema.parse({ questionId: question.id, assessmentId, updatedAt: question.updatedAt.toISOString(), type: question.type,
      title: 'Edited bank title', text: question.text ?? '', definition: question.definition, scoringMode: question.scoringMode,
      options: question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !o.isCorrect })), assessmentPassingScore: 60, assessmentMaxAttempts: 1 });
    const saved = await bank.save(lessonId, org, draft.revision, input);
    expect(saved).toEqual({ questionId: question.id, revision: draft.revision + 1 });
    expect((await prisma.assessmentAnswerOption.findMany({ where: { questionId: question.id, deletedAt: null }, orderBy: { order: 'asc' } })).map((o) => o.id)).toEqual(question.options.map((o) => o.id));
    await expect(bank.save(lessonId, org, saved.revision, input)).rejects.toBeInstanceOf(ConflictException);
    const unchanged = await reader.read(lessonId, learner); expect(unchanged.chapters[0]!.blocks[0]!.question?.title).toBe('Question 0');
    expect((await submit(0)).acceptedResult.score).toBe(8);
    await versions.publish(lessonId, org, saved.revision, admin.id);
    expect((await submit(0, 1, good[0], second, 2)).acceptedResult.score).toBe(0);
  });

  it('does not accept answers for hidden blocks or locked sequential chapters', async () => {
    const d = await drafts.getDraft(lessonId, org);
    const block = (index: number, hidden = false) => { const b = d.chapters[0]!.blocks[index]!; return { id: b.id, type: b.type, schemaVersion: b.schemaVersion, content: b.content, hidden }; };
    const changed = await drafts.saveDraft(lessonId, org, { revision: d.revision, settings: { ...d.settings, readingOrder: 'sequential' }, chapters: [
      { id: d.chapters[0]!.id, title: 'First', hidden: false, blocks: [block(0), block(2, true)] },
      { title: 'Locked', hidden: false, blocks: [block(1)] },
    ] }, admin.id);
    await versions.publish(lessonId, org, changed.revision, admin.id);
    await expect(submit(1, 1, good[1], learner, 2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(submit(2, 1, good[2], learner, 2)).rejects.toBeInstanceOf(NotFoundException);
    await submit(0, 1, good[0], learner, 2); await reader.complete(lessonId, learner, { version: 2, chapter: changed.chapters[0]!.anchor });
    await reader.position(lessonId, learner, { version: 2, chapter: changed.chapters[1]!.anchor, mode: 'navigate' });
    expect((await submit(1, 1, good[1], learner, 2)).acceptedResult.score).toBe(8);
  });

  it('blocks unpublished missing/foreign question references and permits no additional final beyond the parent budget', async () => {
    await answerAll(); await exercises.finish(lessonId, learner, 1, assessmentId);
    await submit(0, 2); await exercises.finish(lessonId, learner, 1, assessmentId);
    await expect(submit(0, 3)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(submit(7)).resolves.toBeDefined(); // practice budget is independent
    const d = await drafts.getDraft(lessonId, org);
    await prisma.longreadBlock.update({ where: { id: blocks[0] }, data: { content: exerciseContentSchema.parse({ questionId: randomUUID() }) } });
    expect((await versions.publishCheck(lessonId, org)).reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'question_unavailable' })]));
    await expect(versions.publish(lessonId, org, d.revision, admin.id)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  async function progressFixture(options: { mode?: 'free' | 'answered' | 'correct'; seconds?: number; order?: 'free' | 'sequential'; required?: number; fileId?: string } = {}) {
    const draft = await drafts.getDraft(lessonId, org), source = draft.chapters[0]!.blocks;
    const keep = (index: number) => { const b = source[index]!; return { id: b.id, type: b.type, schemaVersion: b.schemaVersion, content: b.content }; };
    const gate = { type: 'continue', schemaVersion: 1, content: { mode: options.mode ?? 'correct', minViewSeconds: options.seconds ?? 0 } };
    const saved = await drafts.saveDraft(lessonId, org, { revision: draft.revision, settings: { ...draft.settings, readingOrder: options.order ?? 'sequential', requiredChapters: options.required ?? 2 }, chapters: [
      { id: draft.chapters[0]!.id, title: 'Gated', hidden: false, blocks: [keep(0), gate, keep(1), gate, ...(options.fileId ? [{ type: 'image', schemaVersion: 1, content: { fileId: options.fileId, alt: 'Image', caption: '', width: 100, align: 'center' } }] : [])] },
      { title: 'Second', hidden: false, blocks: [{ type: 'paragraph', schemaVersion: 1, content: { runs: [{ text: 'Second content' }] } }] },
      { title: 'Optional', hidden: false, blocks: [{ type: 'paragraph', schemaVersion: 1, content: { runs: [] } }] },
      { title: 'Hidden', hidden: true, blocks: [keep(2)] },
    ] }, admin.id);
    await versions.publish(lessonId, org, saved.revision, admin.id);
    const chapter = saved.chapters[0]!.anchor, gateA = saved.chapters[0]!.blocks[1]!.id, gateB = saved.chapters[0]!.blocks[3]!.id;
    const pass = (blockId: string) => reader.complete(lessonId, learner, { version: 2, chapter, blockId });
    const finishChapter = () => reader.complete(lessonId, learner, { version: 2, chapter });
    return { chapter, gateA, gateB, pass, finishChapter, saved };
  }
  describe('PR 390: Continue and authoritative chapter completion', () => {
    it('preserves a completed pre-390 record without creating assessment results or changing its timestamp', async () => {
      const revision = await prisma.longreadRevision.findFirstOrThrow({ where: { organizationId: org } });
      const chapter = (await drafts.getDraft(lessonId, org)).chapters[0]!.anchor, completedAt = new Date('2026-10-31T12:00:00Z');
      const row = await prisma.progress.create({ data: { organizationId: org, courseId, lessonId, userId: learner.id, status: 'completed', score: 100, completedAt, longreadRevisionId: revision.id, longreadReadingState: { version: 1, chapter, headingIndex: null, maxReached: 0 } } });
      expect((await reader.read(lessonId, learner)).completion).toMatchObject({ completed: true, percentage: 100 });
      expect((await prisma.progress.findUniqueOrThrow({ where: { id: row.id } })).completedAt).toEqual(completedAt);
      expect(await prisma.assessmentAttempt.count({ where: { organizationId: org } })).toBe(0);
    });

    it('scopes A → Continue A → B → Continue B and never reveals/accepts B before A', async () => {
      const f = await progressFixture(), first = await reader.read(lessonId, learner);
      expect(first.chapters[0]!.blocks.map((b) => b.id)).toEqual([blocks[0], f.gateA]);
      await expect(submit(1, 1, good[1], learner, 2)).rejects.toBeInstanceOf(NotFoundException);
      await expect(f.pass(f.gateB)).rejects.toBeInstanceOf(UnprocessableEntityException);
      await submit(0, 1, good[0], learner, 2); const opened = await f.pass(f.gateA);
      expect(opened.chapters[0]!.blocks).toHaveLength(4);
      await submit(1, 1, bad[1], learner, 2);
      const current = await reader.read(lessonId, learner);
      expect(current.completion.chapters[0]!.gates[0]).toMatchObject({ passed: true, reasons: [] });
      expect(current.completion.chapters[0]!.gates[1]!.reasons).toContainEqual(expect.objectContaining({ code: 'incorrect' }));
      await expect(f.pass(f.gateA)).resolves.toBeDefined();
      await expect(f.pass(f.gateB)).rejects.toBeInstanceOf(UnprocessableEntityException);
      await submit(1, 2, good[1], learner, 2); await f.pass(f.gateB); expect((await f.finishChapter()).completion.percentage).toBe(50);
    });
    it('allows wrong answers in answered mode and free continuation, but still requires mandatory answers for chapter completion', async () => {
      const f = await progressFixture({ mode: 'answered' }); await submit(0, 1, bad[0], learner, 2); await f.pass(f.gateA); await submit(1, 1, bad[1], learner, 2); await f.pass(f.gateB);
      expect((await f.finishChapter()).completion.percentage).toBe(50);
      const secondView = await reader.read(lessonId, second); expect(secondView.completion.completedCount).toBe(0);
    });
    it('persists progress once under concurrent clicks/tabs and uses the same projection in admin reports', async () => {
      const f = await progressFixture({ mode: 'free' }); await reader.read(lessonId, learner);
      await Promise.all([f.pass(f.gateA), f.pass(f.gateA)]); await f.pass(f.gateB);
      await expect(f.finishChapter()).rejects.toBeInstanceOf(UnprocessableEntityException);
      await submit(0, 1, bad[0], learner, 2); await submit(1, 1, bad[1], learner, 2);
      const [a, b] = await Promise.all([f.finishChapter(), f.finishChapter()]);
      expect(a.completion).toEqual(b.completion); expect(a.completion.completedCount).toBe(1);
      const next = f.saved.chapters[1]!.anchor; await reader.position(lessonId, learner, { version: 2, chapter: next, mode: 'navigate' });
      const done = await reader.complete(lessonId, learner, { version: 2, chapter: next });
      expect(done.completion).toMatchObject({ percentage: 100, completed: true, requiredCount: 2, completedCount: 2 });
      const row = await prisma.progress.findFirstOrThrow({ where: { lessonId, userId: learner.id } });
      const report = await new ProgressService(prisma).getProgress(row.id, admin);
      expect(report.longread).toEqual(done.completion);
      expect((await new ReportsService(prisma).getSummary(admin)).progress.find((p) => p.id === row.id)?.longread).toEqual(done.completion); expect(report).toMatchObject({ status: 'completed', score: 100 });
      await reader.complete(lessonId, learner, { version: 2, chapter: next });
      expect((await prisma.progress.findUniqueOrThrow({ where: { id: row.id } })).completedAt).toEqual(row.completedAt);
      await expect(new ProgressService(prisma).createProgress({ organizationId: org, courseId, lessonId, userId: learner.id, status: 'completed' }, learner)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('uses the database clock, rejects forged time/completion, and keeps the timer across a reload', async () => {
      const f = await progressFixture({ mode: 'free', seconds: 60 }); await reader.read(lessonId, learner);
      await expect(f.pass(f.gateA)).rejects.toBeInstanceOf(UnprocessableEntityException);
      const row = await prisma.progress.findFirstOrThrow({ where: { lessonId, userId: learner.id } });
      const state = row.longreadReadingState as unknown as { learning: Record<string, { chapters: Record<string, { enteredAt: string }> }> };
      const entered = state.learning['2']!.chapters[f.chapter]!.enteredAt;
      await reader.read(lessonId, learner); expect(((await prisma.progress.findUniqueOrThrow({ where: { id: row.id } })).longreadReadingState as unknown as typeof state).learning['2']!.chapters[f.chapter]!.enteredAt).toBe(entered);
      state.learning['2']!.chapters[f.chapter]!.enteredAt = new Date(Date.now() - 61_000).toISOString();
      await prisma.progress.update({ where: { id: row.id }, data: { longreadReadingState: state } }); await expect(f.pass(f.gateA)).resolves.toBeDefined();
      const request = await guard(learner, controller.completeChapter);
      expect(() => controller.completeChapter(lessonId, { version: 2, chapter: f.chapter, elapsed: 1_000_000 }, request)).toThrow();
    });
    it.each(['free', 'sequential'] as const)('rejects URL/API jumps past required chapters in %s order', async (order) => {
      const f = await progressFixture({ mode: 'free', order, required: 1 });
      await expect(reader.read(lessonId, learner, f.saved.chapters[1]!.anchor)).rejects.toBeInstanceOf(NotFoundException);
      await expect(reader.position(lessonId, learner, { version: 2, chapter: f.saved.chapters[2]!.anchor, mode: 'navigate' })).rejects.toBeInstanceOf(NotFoundException);
      await submit(0, 1, good[0], learner, 2); await f.pass(f.gateA); await submit(1, 1, good[1], learner, 2); await f.pass(f.gateB); await f.finishChapter();
      if (order === 'free') await expect(reader.read(lessonId, learner, f.saved.chapters[2]!.anchor)).resolves.toBeDefined();
      else await expect(reader.read(lessonId, learner, f.saved.chapters[2]!.anchor)).rejects.toBeInstanceOf(NotFoundException);
      await expect(reader.read(lessonId, learner, f.saved.chapters[3]!.anchor)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('reports exhausted attempts and unavailable files separately; later files do not block the first Continue', async () => {
      const doc = await prisma.longreadDocument.findFirstOrThrow({ where: { lessonId } });
      const file = await prisma.courseMaterial.create({ data: { organizationId: org, courseId, lessonId, longreadDocumentId: doc.id, title: 'Image', slug: randomUUID(), mimeType: 'image/png', objectKey: randomUUID(), scanStatus: 'available' } });
      const f = await progressFixture({ fileId: file.id }); await prisma.courseMaterial.update({ where: { id: file.id }, data: { scanStatus: 'rejected' } });
      await submit(0, 1, good[0], learner, 2); await expect(f.pass(f.gateA)).resolves.toBeDefined();
      for (let n = 1; n <= 3; n++) await submit(1, n, bad[1], learner, 2);
      const view = await reader.read(lessonId, learner); expect(view.completion.chapters[0]!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['exhausted', 'file_unavailable']));
      await expect(f.finishChapter()).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
    it('retains old completion after republish, isolates versions, and keeps author preview read-only', async () => {
      const f = await progressFixture({ mode: 'free', required: 1 }); await submit(0, 1, good[0], learner, 2); await f.pass(f.gateA); await submit(1, 1, good[1], learner, 2); await f.pass(f.gateB); const before = await f.finishChapter();
      const old = await prisma.progress.findFirstOrThrow({ where: { lessonId, userId: learner.id } }), draft = await drafts.getDraft(lessonId, org);
      await prisma.longreadDocument.update({ where: { lessonId }, data: { draftRevision: { increment: 1 } } }); await versions.publish(lessonId, org, draft.revision + 1, admin.id);
      expect((await reader.read(lessonId, learner)).completion).toEqual(before.completion); expect((await reader.read(lessonId, second)).completion).toMatchObject({ version: 3, percentage: 0 });
      const dataBeforePreview = await prisma.progress.findMany({ where: { organizationId: org } });
      const preview = await reader.preview(lessonId, org); expect(preview.preview).toBe(true);
      expect(await prisma.progress.findMany({ where: { organizationId: org } })).toEqual(dataBeforePreview);
      const revision = await prisma.longreadRevision.findFirstOrThrow({ where: { documentId: (await prisma.longreadDocument.findFirstOrThrow({ where: { lessonId } })).id, number: 3 } });
      await prisma.progress.update({ where: { id: old.id }, data: { longreadRevisionId: revision.id } });
      expect((await reader.read(lessonId, learner)).completion).toMatchObject({ version: 3, percentage: 0 });
      const updated = await prisma.progress.findUniqueOrThrow({ where: { id: old.id } });
      expect((updated.longreadReadingState as unknown as { learning: Record<string, { summary: unknown }> }).learning['2']!.summary).toEqual(before.completion); expect(updated.status).toBe('in_progress');
    });
  });

});

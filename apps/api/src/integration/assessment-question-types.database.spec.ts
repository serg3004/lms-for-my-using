/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BadRequestException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { QuestionDefinition, QuestionResponse, QuestionScoringMode } from '@lms/shared/assessment-question-types';
import { PrismaService } from '../database/prisma.service.js';
import { AssessmentQuestionsService } from '../modules/assessment-questions/assessment-questions.service.js';
import { AssessmentQuestionsController } from '../modules/assessment-questions/assessment-questions.controller.js';
import { createAssessmentQuestionSchema } from '../modules/assessment-questions/assessment-questions.schemas.js';
import { AssessmentAttemptsService } from '../modules/assessment-attempts/assessment-attempts.service.js';
import { AssessmentResultsService } from '../modules/assessment-attempts/assessment-results.service.js';
import { createAssessmentAttemptSchema, type CreateAssessmentAttemptInput } from '../modules/assessment-attempts/assessment-attempts.schemas.js';
import { AssessmentsService } from '../modules/assessments/assessments.service.js';
import { RolesGuard, type CurrentUser, type AuthenticatedRequest } from '../modules/auth/public.js';
import { CourseAccessGuard, CourseAccessPolicy } from '../modules/course-access/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Item ${id}` }));
const definitions: QuestionDefinition[] = [
  { type: 'true_false', correctAnswer: false },
  { type: 'matching', left: items, right: items, correctPairs: items.map(({ id }) => ({ leftId: id, rightId: id })) },
  { type: 'ordering', items, correctOrder: ['c', 'a', 'd', 'b'] },
  { type: 'fill_blank', blanks: [{ id: 'city', acceptedAnswers: ['Алматы', 'Almaty'] }, { id: 'country', acceptedAnswers: ['Қазақстан', 'Kazakhstan'] }], caseSensitive: false, whitespace: 'collapse' },
  { type: 'short_answer', acceptedAnswers: ['Café', 'Coffee'], caseSensitive: false, whitespace: 'trim' },
];
const correctResponses: QuestionResponse[] = [
  { type: 'true_false', value: false },
  { type: 'matching', pairs: items.map(({ id }) => ({ leftId: id, rightId: id })) },
  { type: 'ordering', itemIds: ['c', 'a', 'd', 'b'] },
  { type: 'fill_blank', blanks: [{ blankId: 'country', value: '  қазақстан\n' }, { blankId: 'city', value: 'ALMATY' }] },
  { type: 'short_answer', text: '  CAFE\u0301  ' },
];

describe('seven assessment question types and legacy grading — database', () => {
  const prisma = new PrismaService(), questions = new AssessmentQuestionsService(prisma), attempts = new AssessmentAttemptsService(prisma), results = new AssessmentResultsService(prisma), papers = new AssessmentsService(prisma);
  let databaseReady = false;
  let org: string, foreignOrg: string, courseId: string, assessmentId: string, learner: CurrentUser, instructor: CurrentUser, unassigned: CurrentUser;
  async function person(role: 'learner' | 'instructor', organizationId = org): Promise<CurrentUser> {
    const user = await prisma.user.create({ data: { organizationId, email: `${randomUUID()}@example.test`, firstName: 'Question', lastName: 'Test', passwordHash: 'unused' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { ...user, roles: [role] };
  }
  async function createDefined(definition: QuestionDefinition, scoringMode: QuestionScoringMode = 'all_or_nothing') {
    return questions.createQuestion(assessmentId, createAssessmentQuestionSchema.parse({ organizationId: org, type: definition.type, definition, title: definition.type, points: 8, scoringMode }));
  }
  async function createChoice(type: 'single_choice' | 'multiple_choice' | 'true_false', scoringMode: QuestionScoringMode = 'all_or_nothing') {
    const question = await questions.createQuestion(assessmentId, createAssessmentQuestionSchema.parse({ organizationId: org, type, title: type, points: 4, scoringMode }));
    const options = [];
    for (let index = 0; index < (type === 'multiple_choice' ? 3 : 2); index++) options.push(await questions.createAnswerOption(question.id, { organizationId: org, text: `Option ${index}`, isCorrect: type === 'multiple_choice' ? index < 2 : index === 0, order: index }));
    return { question, options };
  }
  async function submit(input: CreateAssessmentAttemptInput) { return attempts.createAttempt(assessmentId, learner.id, org, input); }
  async function request(actor: CurrentUser, handler = AssessmentQuestionsController.prototype.createQuestion) {
    const req = { currentUser: actor, params: { assessmentId }, body: { organizationId: actor.organizationId } } as unknown as AuthenticatedRequest;
    const context = { getHandler: () => handler, getClass: () => AssessmentQuestionsController, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await new RolesGuard(prisma, new Reflector()).canActivate(context);
    await new CourseAccessGuard(new Reflector(), new CourseAccessPolicy(prisma)).canActivate(context);
    return req;
  }
  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    await prisma.$connect(); databaseReady = true;
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    org = ''; foreignOrg = '';
    org = (await prisma.organization.create({ data: { name: 'Questions', slug: `questions-${randomUUID()}` } })).id;
    foreignOrg = (await prisma.organization.create({ data: { name: 'Other', slug: `other-${randomUUID()}` } })).id;
    learner = await person('learner'); instructor = await person('instructor'); unassigned = await person('instructor');
    courseId = (await prisma.course.create({ data: { organizationId: org, title: 'Course', slug: `course-${randomUUID()}` } })).id;
    await prisma.courseInstructor.create({ data: { organizationId: org, courseId, instructorId: instructor.id } });
    assessmentId = (await prisma.assessment.create({ data: { organizationId: org, courseId, title: 'Seven types', slug: `quiz-${randomUUID()}`, availableAfterCourseCompletion: false, passingScore: 70 } })).id;
  });
  afterEach(async () => {
    if (!databaseReady || !org) return;
    await prisma.certificate.deleteMany({ where: { organizationId: org } });
    await prisma.notification.deleteMany({ where: { organizationId: org } });
    await prisma.assessmentAttemptAnswer.deleteMany({ where: { organizationId: org } });
    await prisma.assessmentAttempt.deleteMany({ where: { organizationId: org } });
    await prisma.assessmentAnswerOption.deleteMany({ where: { organizationId: org } });
    await prisma.assessmentQuestion.deleteMany({ where: { organizationId: org } });
    await prisma.assessment.deleteMany({ where: { organizationId: org } });
    await prisma.courseInstructor.deleteMany({ where: { organizationId: org } });
    await prisma.course.deleteMany({ where: { organizationId: org } });
    await prisma.membership.deleteMany({ where: { organizationId: { in: [org, foreignOrg].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: [org, foreignOrg].filter(Boolean) } } });
    await prisma.organization.deleteMany({ where: { id: { in: [org, foreignOrg].filter(Boolean) } } });
  });

  it('round-trips all seven types, grades on the server, records answers, report and certificate; author preview writes nothing', async () => {
    const single = await createChoice('single_choice'), multiple = await createChoice('multiple_choice');
    const defined = await Promise.all(definitions.map((definition) => createDefined(definition)));
    const answers = [{ questionId: single.question.id, selectedOptionId: single.options[0]!.id }, { questionId: multiple.question.id, selectedOptionIds: multiple.options.slice(0, 2).map((option) => option.id) }, ...defined.map((question, index) => ({ questionId: question.id, response: correctResponses[index]! }))];
    const input = createAssessmentAttemptSchema.parse({ answers });
    expect((await questions.listQuestions(assessmentId, org)).map((question) => question.type).sort()).toEqual(['single_choice', 'multiple_choice', ...definitions.map((definition) => definition.type)].sort());
    expect(await attempts.previewAttempt(assessmentId, org, input)).toMatchObject({ score: 48, maxScore: 48, percentage: 100, passed: true });
    expect(await prisma.assessmentAttempt.count({ where: { assessmentId } })).toBe(0);
    expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
    await papers.updateAssessmentStatus(assessmentId, org, 'published');
    const quiz = await questions.listLearnerQuizQuestions(assessmentId, org, learner.id);
    expect(JSON.stringify(quiz)).not.toMatch(/correctPairs|correctOrder|acceptedAnswers|correctAnswer|isCorrect|Café|Қазақстан/);
    const attempt = await submit(input);
    expect(attempt).toMatchObject({ score: 48, maxScore: 48, percentage: 100, passed: true });
    expect(attempt.answers.filter((answer) => answer.response !== null)).toHaveLength(5);
    await expect(prisma.assessmentAttemptAnswer.update({ where: { id: attempt.answers.find((answer) => answer.selectedOptionId)!.id }, data: { response: correctResponses[0] } })).rejects.toThrow('selection_check');
    expect(await prisma.certificate.findFirst({ where: { assessmentAttemptId: attempt.id } })).toMatchObject({ status: 'issued', userId: learner.id, courseId });
    expect(await results.getAssessmentReport(assessmentId, org)).toMatchObject({ attemptsCount: 1, passedCount: 1, averagePercentage: 100 });
    expect(JSON.stringify(await results.getAttemptResult(attempt.id, learner))).not.toMatch(/correctPairs|correctOrder|acceptedAnswers|correctAnswer/);
    await papers.updateAssessment(assessmentId, org, { showCorrectAnswers: true });
    expect((await results.getAttemptResult(attempt.id, learner)).answers.filter((answer) => 'correctDefinition' in answer)).toHaveLength(5);
    const wrong: QuestionResponse[] = [{ type: 'true_false', value: true }, { type: 'matching', pairs: items.map(({ id }, index) => ({ leftId: id, rightId: items[(index + 1) % 4]!.id })) }, { type: 'ordering', itemIds: ['b', 'd', 'a', 'c'] }, { type: 'fill_blank', blanks: [{ blankId: 'city', value: '' }, { blankId: 'country', value: 'wrong' }] }, { type: 'short_answer', text: 'Cafe' }];
    const failed = await submit({ answers: [{ questionId: single.question.id, selectedOptionId: single.options[1]!.id }, { questionId: multiple.question.id, selectedOptionIds: [multiple.options[2]!.id] }, ...defined.map((question, index) => ({ questionId: question.id, response: wrong[index]! }))] });
    expect(failed).toMatchObject({ score: 0, maxScore: 48, percentage: 0, passed: false });
    expect(await prisma.certificate.count({ where: { assessmentAttemptId: failed.id } })).toBe(0);
  });

  it.each(['all_or_nothing', 'proportional', 'proportional_with_penalty', 'per_option'] as const)('preserves legacy option-id grades and stored results in %s', async (mode) => {
    const single = await createChoice('single_choice'), boolean = await createChoice('true_false'), multiple = await createChoice('multiple_choice', mode);
    await papers.updateAssessmentStatus(assessmentId, org, 'published');
    const attempt = await submit({ answers: [{ questionId: single.question.id, selectedOptionId: single.options[0]!.id }, { questionId: boolean.question.id, selectedOptionId: boolean.options[1]!.id }, { questionId: multiple.question.id, selectedOptionIds: [multiple.options[0]!.id] }] });
    const expected = { all_or_nothing: 4, proportional: 6, proportional_with_penalty: 6, per_option: 7 }[mode];
    expect(attempt).toMatchObject({ score: expected, maxScore: 12, percentage: Math.round(expected / 12 * 100), passed: false });
    const before = await results.getAttemptResult(attempt.id, learner), report = await results.getAssessmentReport(assessmentId, org);
    await createDefined(definitions[1]!);
    expect(await results.getAttemptResult(attempt.id, learner)).toEqual(before);
    expect(await results.getAssessmentReport(assessmentId, org)).toEqual(report);
  });

  it('rejects forged, missing, duplicate and foreign structures before writing any attempt', async () => {
    const question = await createDefined(definitions[2]!);
    await papers.updateAssessmentStatus(assessmentId, org, 'published');
    const invalid = [
      [{ questionId: question.id, response: { type: 'ordering', itemIds: ['c', 'a', 'd'] } }],
      [{ questionId: question.id, response: { type: 'ordering', itemIds: ['c', 'a', 'd', 'd'] } }],
      [{ questionId: question.id, response: { type: 'ordering', itemIds: ['c', 'a', 'd', 'foreign'] } }],
      [{ questionId: question.id, response: { type: 'short_answer', text: 'c,a,d,b' } }],
      [{ questionId: question.id, selectedOptionId: randomUUID() }],
      [{ questionId: randomUUID(), response: correctResponses[2] }],
      [{ questionId: question.id, response: correctResponses[2] }, { questionId: question.id, response: correctResponses[2] }],
    ];
    for (const answers of invalid) await expect(submit(createAssessmentAttemptSchema.parse({ answers }))).rejects.toThrow(BadRequestException);
    expect(() => createAssessmentAttemptSchema.parse({ answers: [{ questionId: question.id, response: correctResponses[2], score: 999, isCorrect: true }] })).toThrow();
    expect(await prisma.assessmentAttempt.count({ where: { assessmentId } })).toBe(0);
    expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
  });

  it.each(['all_or_nothing', 'proportional', 'proportional_with_penalty', 'per_option'] as const)('persists a partial defined answer in %s without an exact-match flag or certificate', async (mode) => {
    const question = await createDefined(definitions[3]!, mode);
    await papers.updateAssessmentStatus(assessmentId, org, 'published');
    const attempt = await submit({ answers: [{ questionId: question.id, response: { type: 'fill_blank', blanks: [{ blankId: 'city', value: 'ALMATY' }, { blankId: 'country', value: 'wrong' }] } }] });
    const expected = { all_or_nothing: 0, proportional: 4, proportional_with_penalty: 0, per_option: 4 }[mode];
    expect(attempt).toMatchObject({ score: expected, maxScore: 8, passed: false });
    expect(attempt.answers[0]).toMatchObject({ isCorrect: false, score: expected, response: { type: 'fill_blank' } });
    expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
  });

  it('rejects malformed create/update/publish and checks complete effective PATCH state', async () => {
    await expect(questions.createQuestion(assessmentId, createAssessmentQuestionSchema.parse({ organizationId: org, title: 'Mismatched definition', type: 'matching', definition: definitions[2] }))).rejects.toThrow(BadRequestException);
    expect(await prisma.assessmentQuestion.count({ where: { assessmentId } })).toBe(0);
    const question = await createDefined(definitions[2]!);
    await expect(questions.updateQuestion(question.id, org, { type: 'matching' })).rejects.toThrow(BadRequestException);
    await expect(questions.updateQuestion(question.id, org, { definition: null })).rejects.toThrow(BadRequestException);
    expect(await questions.getQuestion(question.id, org)).toMatchObject({ type: 'ordering', definition: definitions[2] });
    await questions.updateQuestion(question.id, org, { title: 'Updated safely' });
    await expect(questions.createAnswerOption(question.id, { organizationId: org, text: 'Forged key', isCorrect: true, order: 0 })).rejects.toThrow(BadRequestException);
    await prisma.assessmentQuestion.update({ where: { id: question.id }, data: { definition: { type: 'ordering', items, correctOrder: ['a', 'a', 'b', 'c'] } } });
    await expect(papers.updateAssessmentStatus(assessmentId, org, 'published')).rejects.toThrow(BadRequestException);
    await expect(papers.updateAssessment(assessmentId, org, { status: 'published' })).rejects.toThrow(BadRequestException);
    expect((await prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId } })).status).toBe('draft');
  });

  it('enforces existing author roles, assigned instructor course scope and tenant scope', async () => {
    await expect(request(learner)).rejects.toThrow(ForbiddenException);
    await expect(request(unassigned)).rejects.toThrow(NotFoundException);
    await request(instructor);
    const question = await createDefined(definitions[4]!);
    await expect(questions.getQuestion(question.id, foreignOrg)).rejects.toThrow(NotFoundException);
    await expect(questions.updateQuestion(question.id, foreignOrg, { title: 'Intrusion' })).rejects.toThrow(NotFoundException);
    await expect(questions.listLearnerQuizQuestions(assessmentId, foreignOrg, learner.id)).rejects.toThrow(NotFoundException);
    await expect(attempts.createAttempt(assessmentId, learner.id, foreignOrg, { answers: [{ questionId: question.id, response: correctResponses[4]! }] })).rejects.toThrow(NotFoundException);
  });

  it('keeps historical options but prevents their CRUD from editing a converted defined question', async () => {
    const legacy = await createChoice('single_choice');
    await questions.updateQuestion(legacy.question.id, org, { type: 'ordering', definition: definitions[2]! });
    expect(await questions.listAnswerOptions(legacy.question.id, org)).toEqual([]);
    await expect(questions.updateAnswerOption(legacy.options[0]!.id, org, { isCorrect: false })).rejects.toThrow(BadRequestException);
    await expect(questions.deleteAnswerOption(legacy.options[0]!.id, org)).rejects.toThrow(BadRequestException);
    expect(await prisma.assessmentAnswerOption.count({ where: { questionId: legacy.question.id, deletedAt: null } })).toBe(2);
  });

  it('applies the actual additive SQL to a legacy schema and preserves every legacy row and enum value', async () => {
    const legacy = await createChoice('single_choice');
    await papers.updateAssessmentStatus(assessmentId, org, 'published');
    const attempt = await submit({ answers: [{ questionId: legacy.question.id, selectedOptionId: legacy.options[0]!.id }] });
    const resultBefore = await results.getAttemptResult(attempt.id, learner), reportBefore = await results.getAssessmentReport(assessmentId, org), certBefore = await prisma.certificate.findFirstOrThrow({ where: { assessmentAttemptId: attempt.id } });
    const schema = `pr388_${randomUUID().replaceAll('-', '')}`;
    // Random identifier is generated here, never derived from input. All changes stay in this disposable schema.
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    try {
      const before = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
        await tx.$executeRawUnsafe(`CREATE TYPE "${schema}"."AssessmentQuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false')`);
        await tx.$executeRawUnsafe('CREATE TABLE assessment_questions (LIKE public.assessment_questions INCLUDING ALL)');
        await tx.$executeRawUnsafe('CREATE TABLE assessment_attempt_answers (LIKE public.assessment_attempt_answers INCLUDING ALL)');
        await tx.$executeRawUnsafe('ALTER TABLE assessment_questions DROP COLUMN definition');
        await tx.$executeRawUnsafe('ALTER TABLE assessment_attempt_answers DROP COLUMN response');
        await tx.$executeRawUnsafe('ALTER TABLE assessment_attempt_answers ADD CONSTRAINT assessment_attempt_answers_selection_check CHECK ((selected_option_id IS NOT NULL AND selected_option_ids IS NULL) OR (selected_option_id IS NULL AND selected_option_ids IS NOT NULL))');
        await tx.$executeRawUnsafe('ALTER TABLE assessment_questions ALTER COLUMN type DROP DEFAULT');
        await tx.$executeRawUnsafe(`ALTER TABLE assessment_questions ALTER COLUMN type TYPE "${schema}"."AssessmentQuestionType" USING type::text::"${schema}"."AssessmentQuestionType"`);
        await tx.$executeRawUnsafe("ALTER TABLE assessment_questions ALTER COLUMN type SET DEFAULT 'single_choice'");
        await tx.$executeRaw`INSERT INTO assessment_questions (id, organization_id, assessment_id, type, title, points, "order", scoring_mode, created_at, updated_at) SELECT id, organization_id, assessment_id, type::text::"AssessmentQuestionType", title, points, "order", scoring_mode, created_at, updated_at FROM public.assessment_questions WHERE id = ${legacy.question.id}::uuid`;
        await tx.$executeRaw`INSERT INTO assessment_attempt_answers (id, organization_id, attempt_id, question_id, selected_option_id, selected_option_ids, is_correct, score, created_at, updated_at) SELECT id, organization_id, attempt_id, question_id, selected_option_id, selected_option_ids, is_correct, score, created_at, updated_at FROM public.assessment_attempt_answers WHERE attempt_id = ${attempt.id}::uuid`;
        const rows = await tx.$queryRaw`SELECT to_jsonb(q) AS question FROM assessment_questions q`;
        const answers = await tx.$queryRaw`SELECT to_jsonb(a) AS answer FROM assessment_attempt_answers a`;
        const migration = readFileSync(new URL('../../prisma/migrations/20261031130000_add_assessment_question_types/migration.sql', import.meta.url), 'utf8');
        for (const statement of migration.replace(/^--.*$/gm, '').split(';').map((value) => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        expect(await tx.$queryRaw`SELECT to_jsonb(q) - 'definition' AS question FROM assessment_questions q`).toEqual(rows);
        expect(await tx.$queryRaw`SELECT to_jsonb(a) - 'response' AS answer FROM assessment_attempt_answers a`).toEqual(answers);
        return { rows, answers };
      });
      expect(before.rows).toHaveLength(1); expect(before.answers).toHaveLength(1);
      const values = await prisma.$queryRaw<{ enumlabel: string }[]>`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = ${schema} ORDER BY e.enumsortorder`;
      expect(values.map((row) => row.enumlabel)).toEqual(['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer']);
      expect(await results.getAttemptResult(attempt.id, learner)).toEqual(resultBefore);
      expect(await results.getAssessmentReport(assessmentId, org)).toEqual(reportBefore);
      expect(await prisma.certificate.findUniqueOrThrow({ where: { id: certBefore.id } })).toEqual(certBefore);
    } finally { await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
  });
});

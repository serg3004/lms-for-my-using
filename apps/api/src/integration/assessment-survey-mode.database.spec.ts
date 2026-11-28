/// <reference types="jest" />
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AssessmentAttemptsService } from '../modules/assessment-attempts/assessment-attempts.service.js';
import { AssessmentSurveyReportService } from '../modules/assessment-attempts/assessment-survey-report.service.js';
import { assessmentEditorContentSchema, type SaveAssessmentEditorInput } from '../modules/assessments/assessments.schemas.js';
import { AssessmentsService } from '../modules/assessments/assessments.service.js';
import { StandaloneAssessmentsService } from '../modules/assessments/public.js';
import type { CurrentUser } from '../modules/auth/public.js';
import type { BackgroundJobsService } from '../modules/background-jobs/public.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

describe('survey mode of a test — database', () => {
  const prisma = new PrismaService(), attempts = new AssessmentAttemptsService(prisma), papers = new AssessmentsService(prisma), report = new AssessmentSurveyReportService(prisma);
  let databaseReady = false;
  let org: string, surveyId: string, likert: string, comment: string, options: string[], admin: CurrentUser, first: CurrentUser, second: CurrentUser;
  async function person(role: 'learner' | 'admin', name: string): Promise<CurrentUser> {
    const user = await prisma.user.create({ data: { organizationId: org, email: `${randomUUID()}@example.test`, firstName: name, lastName: 'Surveyed', passwordHash: 'unused' } });
    await prisma.membership.create({ data: { organizationId: org, userId: user.id, role } });
    return { ...user, roles: [role] };
  }
  async function edit(id: string, action: SaveAssessmentEditorInput['action'], change: (content: SaveAssessmentEditorInput['content']) => void = () => undefined) {
    const editor = await papers.getEditor(id, org);
    const content = assessmentEditorContentSchema.parse({ settings: { ...editor.assessment, policy: editor.assessment.policy ?? undefined }, questions: editor.questions });
    change(content);
    return papers.saveEditor(id, org, { revision: editor.assessment.updatedAt.toISOString(), action, confirmPublished: true, content }, admin.id);
  }
  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    await prisma.$connect(); databaseReady = true;
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    org = (await prisma.organization.create({ data: { name: 'Survey', slug: `survey-${randomUUID()}` } })).id;
    admin = await person('admin', 'Admin'); first = await person('learner', 'Anna'); second = await person('learner', 'Boris');
    surveyId = (await prisma.assessment.create({ data: { organizationId: org, title: 'Satisfaction', slug: `survey-${randomUUID()}`, mode: 'survey', maxAttempts: 1 } })).id;
    likert = (await prisma.assessmentQuestion.create({ data: { organizationId: org, assessmentId: surveyId, type: 'single_choice', title: 'I like my work', order: 0 } })).id;
    comment = (await prisma.assessmentQuestion.create({ data: { organizationId: org, assessmentId: surveyId, type: 'short_answer', title: 'Comment', order: 1,
      definition: { type: 'short_answer', manualReview: true, acceptedAnswers: [], caseSensitive: false, whitespace: 'trim' } } })).id;
    options = [];
    for (const [order, text] of ['Disagree', 'Neutral', 'Agree'].entries()) {
      options.push((await prisma.assessmentAnswerOption.create({ data: { organizationId: org, questionId: likert, text, order, isCorrect: false } })).id);
    }
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
    await prisma.membership.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.deleteMany({ where: { id: org } });
  });
  const answers = (option: number, text: string) => ({ answers: [
    { questionId: likert, selectedOptionId: options[option]! },
    { questionId: comment, response: { type: 'short_answer' as const, text } },
  ] });

  it('publishes without a right answer, records an unscored attempt and keeps it out of pass statistics', async () => {
    await edit(surveyId, 'publish');
    expect(await prisma.assessment.findUniqueOrThrow({ where: { id: surveyId } })).toMatchObject({ status: 'published', mode: 'survey' });
    const attempt = await attempts.createAttempt(surveyId, first.id, org, answers(2, 'Good team'));
    expect(attempt).toMatchObject({ status: 'completed', passed: false, score: 0, maxScore: 0, percentage: 0 });
    expect(await prisma.assessmentAttemptAnswer.count({ where: { attemptId: attempt.id, isCorrect: false, reviewPending: false, score: 0 } })).toBe(2);
    expect(await prisma.notification.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.certificate.count({ where: { organizationId: org } })).toBe(0);
    await expect(attempts.createAttempt(surveyId, first.id, org, answers(1, 'Again'))).rejects.toThrow('Assessment attempts limit reached');
    const standalone = new StandaloneAssessmentsService(prisma, {} as BackgroundJobsService);
    await standalone.assign(surveyId, org, { target: 'user', targetId: first.id, dueAt: new Date(Date.now() + 3_600_000) });
    // An answered survey is done although it has no pass verdict.
    expect(await standalone.listMine(org, first.id)).toMatchObject([{ assessment: { id: surveyId, mode: 'survey' }, attemptsUsed: 1, completed: true }]);
    const library = await papers.listLibrary(org, admin, false, { sort: 'createdAt', direction: 'desc', page: 1, pageSize: 25 });
    expect(library.items).toMatchObject([{ id: surveyId, mode: 'survey', attemptsCount: 1, passRate: null }]);
  });

  it('records a survey submitted under an attempt policy the same way, without a result for the policy', async () => {
    await edit(surveyId, 'publish');
    await prisma.assessment.update({ where: { id: surveyId }, data: { policy: { attemptPolicy: 'best' } } });
    const attempt = await attempts.createAttempt(surveyId, first.id, org, answers(1, 'Neutral'));
    expect(attempt).toMatchObject({ status: 'completed', passed: false, score: 0, maxScore: 0, percentage: 0 });
    expect(await prisma.notification.count({ where: { organizationId: org } })).toBe(0);
    expect((await report.report(surveyId, admin)).respondents).toBe(1);
  });

  it('refuses a survey answer that is not a choice of the question or a text', async () => {
    await expect(attempts.createAttempt(surveyId, first.id, org, { answers: [
      { questionId: likert, selectedOptionId: randomUUID() }, { questionId: comment, response: { type: 'short_answer', text: 'x' } },
    ] })).rejects.toThrow(BadRequestException);
    await expect(attempts.createAttempt(surveyId, first.id, org, { answers: [
      { questionId: likert, selectedOptionId: options[0]! }, { questionId: comment, selectedOptionId: options[0]! },
    ] })).rejects.toThrow(BadRequestException);
  });

  it('reports the distribution of choices and the named text answers, and exports them', async () => {
    await edit(surveyId, 'publish');
    await prisma.assessment.update({ where: { id: surveyId }, data: { maxAttempts: null } });
    await attempts.createAttempt(surveyId, first.id, org, answers(2, 'Good team'));
    await attempts.createAttempt(surveyId, second.id, org, answers(2, ''));
    await attempts.createAttempt(surveyId, second.id, org, answers(0, 'Too much work'));
    const result = await report.report(surveyId, admin);
    expect(result.respondents).toBe(3);
    expect(result.questions[0]).toMatchObject({ title: 'I like my work', answered: 3, options: [
      { text: 'Disagree', count: 1, percent: 33 }, { text: 'Neutral', count: 0, percent: 0 }, { text: 'Agree', count: 2, percent: 67 },
    ] });
    expect(result.questions[1]!.texts.map(({ name, text }) => `${name}:${text}`).sort()).toEqual(['Surveyed Anna:Good team', 'Surveyed Boris:Too much work']);
    const file = await report.export(surveyId, admin, 'xlsx', 'ru');
    expect(file.subarray(0, 2).toString()).toBe('PK');
    await expect(report.report(randomUUID(), admin)).rejects.toThrow('Survey not found');
  });

  it('keeps a survey standalone and its mode fixed once someone answered', async () => {
    const course = await prisma.course.create({ data: { organizationId: org, title: 'Course', slug: `course-${randomUUID()}` } });
    const graded = await prisma.assessment.create({ data: { organizationId: org, courseId: course.id, title: 'In a course', slug: `c-${randomUUID()}` } });
    await expect(papers.updateAssessment(graded.id, org, { mode: 'survey' })).rejects.toThrow(BadRequestException);
    await expect(papers.attachPlacement(surveyId, org, { courseId: course.id })).rejects.toThrow('A survey cannot be placed in a course');
    await edit(surveyId, 'publish');
    await attempts.createAttempt(surveyId, first.id, org, answers(1, 'ok'));
    await expect(papers.updateAssessment(surveyId, org, { mode: 'graded' })).rejects.toThrow(ConflictException);
    await prisma.assessmentAttempt.deleteMany({ where: { organizationId: org } });
    await prisma.assessmentAttemptAnswer.deleteMany({ where: { organizationId: org } });
    await prisma.course.deleteMany({ where: { organizationId: org } });
  });

  it('still requires a correct option to publish a graded test and allows only choice and text questions in a survey', async () => {
    const graded = await prisma.assessment.create({ data: { organizationId: org, title: 'Graded', slug: `g-${randomUUID()}` } });
    const question = await prisma.assessmentQuestion.create({ data: { organizationId: org, assessmentId: graded.id, type: 'single_choice', title: 'Q' } });
    for (const [order, isCorrect] of [false, false].entries()) await prisma.assessmentAnswerOption.create({ data: { organizationId: org, questionId: question.id, text: `O${order}`, order, isCorrect } });
    await expect(edit(graded.id, 'publish')).rejects.toThrow(BadRequestException);
    await expect(edit(surveyId, 'save', (content) => {
      content.questions[0] = { ...content.questions[0]!, type: 'true_false', definition: { type: 'true_false', correctAnswer: true } };
    })).rejects.toThrow('A survey offers choice and text questions only');
  });
});

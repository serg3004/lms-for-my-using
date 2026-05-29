import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  CreateAssessmentAttemptInput,
  createAssessmentAttemptAnswerSchema,
  createAssessmentAttemptSchema,
} from './assessment-attempts.schemas.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const assessmentId = '22222222-2222-2222-2222-222222222222';
const courseId = '33333333-3333-3333-3333-333333333333';
const userId = '44444444-4444-4444-4444-444444444444';
const questionId = '55555555-5555-5555-5555-555555555555';
const optionId = '66666666-6666-6666-6666-666666666666';

describe('Assessment attempts validation', () => {
  it('accepts valid single choice attempt input', () => {
    const input = createAssessmentAttemptSchema.parse({
      answers: [
        {
          questionId: organizationId,
          selectedOptionId: assessmentId,
        },
      ],
    });

    expect(input.answers[0]).toEqual({
      questionId: organizationId,
      selectedOptionId: assessmentId,
    });
  });

  it('accepts valid multiple choice answer input', () => {
    const input = createAssessmentAttemptAnswerSchema.parse({
      questionId: organizationId,
      selectedOptionIds: [assessmentId, courseId],
    });

    expect(input.selectedOptionIds).toEqual([assessmentId, courseId]);
  });

  it('rejects answer with both single and multiple selections', () => {
    expect(() =>
      createAssessmentAttemptAnswerSchema.parse({
        questionId: organizationId,
        selectedOptionId: assessmentId,
        selectedOptionIds: [courseId],
      }),
    ).toThrow();
  });

  it('rejects answer without selected options', () => {
    expect(() =>
      createAssessmentAttemptAnswerSchema.parse({
        questionId: organizationId,
      }),
    ).toThrow();
  });
});

function createBasePrismaMock(status: 'draft' | 'published' | 'archived') {
  return {
    assessment: {
      findFirst: async () => ({
        id: assessmentId,
        courseId,
        status,
        passingScore: 70,
        maxAttempts: null,
        availableAfterCourseCompletion: false,
      }),
    },
    user: {
      findFirst: async () => ({ id: userId }),
    },
    lesson: {
      count: async () => 0,
    },
    progress: {
      count: async () => 0,
    },
    assessmentAttempt: {
      count: async () => 0,
      findFirst: async () => ({
        id: 'attempt-id',
        organizationId,
        assessmentId,
        userId,
        status: 'completed',
        score: 1,
        maxScore: 1,
        percentage: 100,
        passed: true,
        startedAt: new Date('2026-05-28T00:00:00.000Z'),
        completedAt: new Date('2026-05-28T00:00:00.000Z'),
        createdAt: new Date('2026-05-28T00:00:00.000Z'),
        updatedAt: new Date('2026-05-28T00:00:00.000Z'),
        answers: [],
      }),
    },
    assessmentQuestion: {
      findMany: async () => [
        {
          id: questionId,
          type: 'single_choice',
          points: 1,
          options: [{ id: optionId, isCorrect: true }],
        },
      ],
    },
    $transaction: async (callback: (tx: unknown) => Promise<string>) =>
      callback({
        assessmentAttempt: {
          create: async () => ({ id: 'attempt-id' }),
        },
        assessmentAttemptAnswer: {
          createMany: async () => ({ count: 1 }),
        },
      }),
  } as unknown as PrismaService;
}

describe('AssessmentAttemptsService attempt eligibility', () => {
  const attemptInput: CreateAssessmentAttemptInput = {
    answers: [
      {
        questionId,
        selectedOptionId: optionId,
      },
    ],
  };

  it('creates attempt for published assessment', async () => {
    const service = new AssessmentAttempsService(createBasePrismaMock('published'));

    const attempt = await service.createAttempt(assessmentId, userId, organizationId, attemptInput);

    expect(attempt).toMatchObject({
      id: 'attempt-id',
      status: 'completed',
      passed: true,
    });
  });

  it('rejects attempt for draft assessment', async () => {
    const service = new AssessmentAttempsService(createBasePrismaMock('draft'));

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attempt for archived assessment', async () => {
    const service = new AssessmentAttempsService(createBasePrismaMock('archived'));

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attempt when gated assessment course is incomplete', async () => {
    let createAttemptCalled = false;
    const prisma = {
      assessment: {
        findFirst: async () => ({
          id: assessmentId,
          courseId,
          status: 'published',
          passingScore: 70,
          maxAttempts: null,
          availableAfterCourseCompletion: true,
        }),
      },
      user: {
        findFirst: async () => ({ id: userId }),
      },
      lesson: {
        count: async () => 2,
      },
      progress: {
        count: async () => 1,
      },
      assessmentAttempt: {
        create: async () => {
          createAttemptCalled = true;

          return { id: assessmentId };
        },
      },
    } as unknown as PrismaService;

    const service = new AssessmentAttemptSService(prisma);

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(createAttemptCalled).toBe(false);
  });
});

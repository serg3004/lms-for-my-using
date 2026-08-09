import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

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

const attemptInput: CreateAssessmentAttemptInput = {
  answers: [
    {
      questionId,
      selectedOptionId: optionId,
    },
  ],
};

type AssessmentStatus = 'draft' | 'published' | 'archived';

type AssessmentAttemptTransaction = {
  assessmentAttempt: {
    create: () => Promise<{ id: string }>;
    update?: (args: unknown) => Promise<{ id: string }>;
  };
  assessmentAttemptAnswer: {
    createMany: () => Promise<{ count: number }>;
  };
  certificate: {
    upsert: () => Promise<{ id: string }>;
  };
};

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

function createBasePrismaMock(status: AssessmentStatus) {
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
    $transaction: async (callback: (tx: AssessmentAttemptTransaction) => Promise<string>) =>
      callback({
        assessmentAttempt: {
          create: async () => ({ id: 'attempt-id' }),
        },
        assessmentAttemptAnswer: {
          createMany: async () => ({ count: 1 }),
        },
        certificate: {
          upsert: async () => ({ id: 'certificate-id' }),
        },
      }),
  } as unknown as PrismaService;
}

describe('AssessmentAttemptsService attempt eligibility', () => {
  it('creates attempt for published assessment', async () => {
    const service = new AssessmentAttemptsService(createBasePrismaMock('published'));

    const attempt = await service.createAttempt(assessmentId, userId, organizationId, attemptInput);

    expect(attempt).toMatchObject({
      id: 'attempt-id',
      status: 'completed',
      passed: true,
    });
  });

  it('rejects attempt for draft assessment', async () => {
    const service = new AssessmentAttemptsService(createBasePrismaMock('draft'));

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attempt for archived assessment', async () => {
    const service = new AssessmentAttemptsService(createBasePrismaMock('archived'));

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

    const service = new AssessmentAttemptsService(prisma);

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(createAttemptCalled).toBe(false);
  });
});

describe('AssessmentAttemptsService multiple_choice scoring modes', () => {
  const optionA = 'aaaaaaaa-0000-4000-8000-000000000001'; // correct
  const optionB = 'bbbbbbbb-0000-4000-8000-000000000002'; // correct
  const optionC = 'cccccccc-0000-4000-8000-000000000003'; // incorrect
  const optionD = 'dddddddd-0000-4000-8000-000000000004'; // incorrect
  const points = 10;

  function buildPrisma(scoringMode: string, selectedOptionIds: string[]) {
    const createManyCalls: { data: { score: number; isCorrect: boolean }[] }[] = [];
    const prisma = {
      assessment: {
        findFirst: async () => ({
          id: assessmentId,
          courseId,
          status: 'published',
          passingScore: 0,
          maxAttempts: null,
          availableAfterCourseCompletion: false,
        }),
      },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentQuestion: {
        findMany: async () => [
          {
            id: questionId,
            type: 'multiple_choice',
            points,
            scoringMode,
            options: [
              { id: optionA, isCorrect: true },
              { id: optionB, isCorrect: true },
              { id: optionC, isCorrect: false },
              { id: optionD, isCorrect: false },
            ],
          },
        ],
      },
      assessmentAttempt: {
        findFirst: async () => ({
          id: 'attempt-id',
          organizationId,
          assessmentId,
          userId,
          status: 'completed',
          score: 0,
          maxScore: points,
          percentage: 0,
          passed: false,
          startedAt: new Date('2026-05-28T00:00:00.000Z'),
          completedAt: new Date('2026-05-28T00:00:00.000Z'),
          createdAt: new Date('2026-05-28T00:00:00.000Z'),
          updatedAt: new Date('2026-05-28T00:00:00.000Z'),
        }),
      },
      $transaction: async (callback: (tx: AssessmentAttemptTransaction) => Promise<string>) =>
        callback({
          assessmentAttempt: { create: async () => ({ id: 'attempt-id' }) },
          assessmentAttemptAnswer: {
            createMany: async (args: { data: { score: number; isCorrect: boolean }[] }) => {
              createManyCalls.push(args);

              return { count: args.data.length };
            },
          },
          certificate: { upsert: async () => ({ id: 'certificate-id' }) },
        }),
    } as unknown as PrismaService;

    const input: CreateAssessmentAttemptInput = { answers: [{ questionId, selectedOptionIds }] };

    return { service: new AssessmentAttemptsService(prisma), input, createManyCalls };
  }

  it('all_or_nothing: partial selection scores 0, only an exact match scores full points', async () => {
    const partial = buildPrisma('all_or_nothing', [optionA]);
    await partial.service.createAttempt(assessmentId, userId, organizationId, partial.input);
    expect(partial.createManyCalls[0].data[0]).toMatchObject({ score: 0, isCorrect: false });

    const exact = buildPrisma('all_or_nothing', [optionA, optionB]);
    await exact.service.createAttempt(assessmentId, userId, organizationId, exact.input);
    expect(exact.createManyCalls[0].data[0]).toMatchObject({ score: points, isCorrect: true });
  });

  it('proportional: awards credit per correct option selected, ignores extra wrong picks', async () => {
    const oneOfTwo = buildPrisma('proportional', [optionA]);
    await oneOfTwo.service.createAttempt(assessmentId, userId, organizationId, oneOfTwo.input);
    expect(oneOfTwo.createManyCalls[0].data[0]).toMatchObject({ score: 5, isCorrect: false });

    const plusWrong = buildPrisma('proportional', [optionA, optionB, optionC]);
    await plusWrong.service.createAttempt(assessmentId, userId, organizationId, plusWrong.input);
    expect(plusWrong.createManyCalls[0].data[0]).toMatchObject({ score: points, isCorrect: false });
  });

  it('proportional_with_penalty: wrong picks reduce the score, floored at 0', async () => {
    const oneCorrectOneWrong = buildPrisma('proportional_with_penalty', [optionA, optionC]);
    await oneCorrectOneWrong.service.createAttempt(assessmentId, userId, organizationId, oneCorrectOneWrong.input);
    expect(oneCorrectOneWrong.createManyCalls[0].data[0]).toMatchObject({ score: 0, isCorrect: false });

    const allWrong = buildPrisma('proportional_with_penalty', [optionC, optionD]);
    await allWrong.service.createAttempt(assessmentId, userId, organizationId, allWrong.input);
    expect(allWrong.createManyCalls[0].data[0]).toMatchObject({ score: 0, isCorrect: false });
  });

  it('per_option: scores each option (selected-and-correct or left-unselected-and-incorrect)', async () => {
    const oneOfTwo = buildPrisma('per_option', [optionA]);
    await oneOfTwo.service.createAttempt(assessmentId, userId, organizationId, oneOfTwo.input);
    // A selected+correct, C/D unselected+incorrect = 3 right judgments; B unselected but correct = wrong judgment.
    expect(oneOfTwo.createManyCalls[0].data[0]).toMatchObject({ score: 8, isCorrect: false });

    const exact = buildPrisma('per_option', [optionA, optionB]);
    await exact.service.createAttempt(assessmentId, userId, organizationId, exact.input);
    expect(exact.createManyCalls[0].data[0]).toMatchObject({ score: points, isCorrect: true });
  });
});

describe('AssessmentAttemptsService timed assessments (startAttempt / late submission)', () => {
  const timeLimitMinutes = 10;

  function buildAssessment(overrides: { timeLimitMinutes?: number | null; maxAttempts?: number | null } = {}) {
    return {
      id: assessmentId,
      courseId,
      status: 'published' as const,
      passingScore: 70,
      maxAttempts: 'maxAttempts' in overrides ? overrides.maxAttempts : null,
      timeLimitMinutes: 'timeLimitMinutes' in overrides ? overrides.timeLimitMinutes : timeLimitMinutes,
      availableAfterCourseCompletion: false,
    };
  }

  it('starts a new in_progress attempt when none exists', async () => {
    const create = jest.fn(async () => ({ id: 'attempt-id' }));
    let findFirstCalls = 0;
    const prisma = {
      assessment: { findFirst: async () => buildAssessment() },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: {
        findFirst: async () => {
          findFirstCalls += 1;
          // 1st call: no existing in_progress attempt. 2nd call: the final getAttempt read-back.
          return findFirstCalls === 1 ? null : { id: 'attempt-id', status: 'in_progress', startedAt: new Date() };
        },
        create,
      },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    const result = await service.startAttempt(assessmentId, userId, organizationId);

    expect(result).toMatchObject({ id: 'attempt-id', status: 'in_progress' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'in_progress', startedAt: expect.any(Date) }),
      }),
    );
  });

  it('rolls back the attempt if the assessment was deleted concurrently while it was being created', async () => {
    const deleteAttempt = jest.fn(async () => ({ id: 'attempt-id' }));
    let assessmentFindFirstCalls = 0;
    const prisma = {
      assessment: {
        findFirst: async () => {
          assessmentFindFirstCalls += 1;
          // 1st call: loadAssessmentForAttempt (assessment still alive). 2nd call: the
          // post-create re-check — simulates a concurrent deleteAssessment() winning the race.
          return assessmentFindFirstCalls === 1 ? buildAssessment() : null;
        },
      },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: {
        findFirst: async () => null,
        create: async () => ({ id: 'attempt-id' }),
        delete: deleteAttempt,
      },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    await expect(service.startAttempt(assessmentId, userId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteAttempt).toHaveBeenCalledWith({ where: { id: 'attempt-id' } });
  });

  it('is idempotent — resumes an existing in_progress attempt instead of creating a new one', async () => {
    const create = jest.fn();
    const prisma = {
      assessment: { findFirst: async () => buildAssessment() },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: {
        findFirst: async () => ({ id: 'existing-attempt-id', status: 'in_progress', startedAt: new Date() }),
        create,
      },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    const result = await service.startAttempt(assessmentId, userId, organizationId);

    expect(result).toMatchObject({ id: 'existing-attempt-id' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects starting an attempt for an assessment with no time limit', async () => {
    const prisma = {
      assessment: { findFirst: async () => buildAssessment({ timeLimitMinutes: null }) },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    await expect(service.startAttempt(assessmentId, userId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the attempts limit before starting a fresh attempt', async () => {
    const create = jest.fn();
    const prisma = {
      assessment: { findFirst: async () => buildAssessment({ maxAttempts: 1 }) },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: {
        findFirst: async () => null,
        count: async () => 1,
        create,
      },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    await expect(service.startAttempt(assessmentId, userId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects submitting answers for a timed assessment that was never started', async () => {
    const prisma = {
      assessment: { findFirst: async () => buildAssessment() },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new AssessmentAttemptsService(prisma);

    await expect(service.createAttempt(assessmentId, userId, organizationId, attemptInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  function buildSubmitPrisma(startedAt: Date) {
    const update = jest.fn(async (args: { data: { passed: boolean; percentage: number } }) => ({
      id: 'attempt-id',
      ...args.data,
    }));
    let findFirstCalls = 0;
    const prisma = {
      assessment: { findFirst: async () => buildAssessment() },
      user: { findFirst: async () => ({ id: userId }) },
      assessmentAttempt: {
        findFirst: async () => {
          findFirstCalls += 1;
          // 1st call: the in_progress lookup. 2nd call: the final getAttempt read-back.
          return findFirstCalls === 1
            ? { id: 'attempt-id', startedAt }
            : { id: 'attempt-id', status: 'completed', startedAt, answers: [] };
        },
      },
      assessmentQuestion: {
        findMany: async () => [
          { id: questionId, type: 'single_choice', points: 1, scoringMode: 'all_or_nothing', options: [{ id: optionId, isCorrect: true }] },
        ],
      },
      $transaction: async (callback: (tx: AssessmentAttemptTransaction) => Promise<string>) =>
        callback({
          assessmentAttempt: { create: async () => ({ id: 'attempt-id' }), update },
          assessmentAttemptAnswer: { createMany: async () => ({ count: 1 }) },
          certificate: { upsert: async () => ({ id: 'certificate-id' }) },
        }),
    } as unknown as PrismaService;

    return { service: new AssessmentAttemptsService(prisma), update };
  }

  it('grades normally and passes a correct, on-time submission', async () => {
    const { service, update } = buildSubmitPrisma(new Date());

    await service.createAttempt(assessmentId, userId, organizationId, attemptInput);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passed: true, percentage: 100 }) }));
  });

  it('forces passed: false for a correct but late submission, without discarding the score', async () => {
    const startedLongAgo = new Date(Date.now() - (timeLimitMinutes + 5) * 60_000);
    const { service, update } = buildSubmitPrisma(startedLongAgo);

    await service.createAttempt(assessmentId, userId, organizationId, attemptInput);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passed: false, percentage: 100 }) }));
  });
});

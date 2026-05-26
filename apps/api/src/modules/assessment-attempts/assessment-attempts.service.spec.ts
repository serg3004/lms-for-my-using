import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import {
  createAssessmentAttemptAnswerSchema,
  createAssessmentAttemptSchema,
} from './assessment-attempts.schemas.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const assessmentId = '22222222-2222-2222-2222-222222222222';
const courseId = '33333333-3333-3333-3333-333333333333';
const userId = '44444444-4444-4444-4444-444444444444';

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

describe('AssessmentAttemptsService completion gate', () => {
  it('rejects attempt when gated assessment course is incomplete', async () => {
    const createAttempt = jest.fn();
    const prisma = {
      assessment: {
        findFirst: jest.fn().mockResolvedValue({
          id: assessmentId,
          courseId,
          passingScore: 70,
          maxAttempts: null,
          availableAfterCourseCompletion: true,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: userId }),
      },
      lesson: {
        count: jest.fn().mockResolvedValue(2),
      },
      progress: {
        count: jest.fn().mockResolvedValue(1),
      },
      assessmentAttempt: {
        create: createAttempt,
      },
    } as unknown as PrismaService;

    const service = new AssessmentAttemptsService(prisma);

    await expect(
      service.createAttempt(assessmentId, userId, organizationId, {
        answers: [
          {
            questionId: organizationId,
            selectedOptionId: assessmentId,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createAttempt).not.toHaveBeenCalled();
  });
});

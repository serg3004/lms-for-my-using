import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AssessmentResultsService } from './assessment-results.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const assessmentId = '22222222-2222-2222-2222-222222222222';
const attemptId = '33333333-3333-3333-3333-333333333333';
const userId = '44444444-4444-4444-4444-444444444444';
const otherUserId = '55555555-5555-5555-5555-555555555555';
const now = new Date('2026-05-26T00:00:00.000Z');

function createAttempt(userIdOverride = userId) {
  return {
    id: attemptId,
    organizationId,
    assessmentId,
    userId: userIdOverride,
    status: 'completed',
    score: 8,
    maxScore: 10,
    percentage: 80,
    passed: true,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    assessment: {
      id: assessmentId,
      title: 'Final test',
      slug: 'final-test',
      passingScore: 70,
    },
    user: {
      id: userIdOverride,
      email: 'learner@example.com',
      firstName: 'Learner',
      lastName: 'User',
    },
    answers: [
      {
        id: '66666666-6666-6666-6666-666666666666',
        questionId: '77777777-7777-7777-7777-777777777777',
        selectedOptionId: '88888888-8888-8888-8888-888888888888',
        selectedOptionIds: null,
        isCorrect: true,
        score: 1,
        createdAt: now,
        updatedAt: now,
        question: {
          id: '77777777-7777-7777-7777-777777777777',
          title: 'Question',
          type: 'single_choice',
          points: 1,
          order: 1,
        },
        selectedOption: {
          id: '88888888-8888-8888-8888-888888888888',
          text: 'Answer',
          imageUrl: null,
        },
      },
    ],
  };
}

describe('AssessmentResultsService', () => {
  it('returns own attempt result with answer summary', async () => {
    const prisma = {
      assessmentAttempt: {
        findFirst: async () => createAttempt(),
      },
      membership: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new AssessmentResultsService(prisma);

    await expect(service.getAttemptResult(attemptId, userId, organizationId)).resolves.toMatchObject({
      id: attemptId,
      userId,
      percentage: 80,
      passed: true,
      answers: [
        {
          questionId: '77777777-7777-7777-7777-777777777777',
          isCorrect: true,
          score: 1,
        },
      ],
    });
  });

  it('rejects another learner attempt result without privileged membership', async () => {
    const prisma = {
      assessmentAttempt: {
        findFirst: async () => createAttempt(otherUserId),
      },
      membership: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const service = new AssessmentResultsService(prisma);

    await expect(service.getAttemptResult(attemptId, userId, organizationId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns aggregate assessment report', async () => {
    const prisma = {
      assessment: {
        findFirst: async () => ({
          id: assessmentId,
          title: 'Final test',
          passingScore: 70,
        }),
      },
      assessmentAttempt: {
        findMany: async () => [
          {
            id: attemptId,
            score: 8,
            maxScore: 10,
            percentage: 80,
            passed: true,
            completedAt: now,
          },
          {
            id: '99999999-9999-9999-9999-999999999999',
            score: 5,
            maxScore: 10,
            percentage: 50,
            passed: false,
            completedAt: now,
          },
        ],
      },
    } as unknown as PrismaService;
    const service = new AssessmentResultsService(prisma);

    await expect(service.getAssessmentReport(assessmentId, organizationId)).resolves.toEqual({
      assessmentId,
      organizationId,
      title: 'Final test',
      passingScore: 70,
      attemptsCount: 2,
      passedCount: 1,
      failedCount: 1,
      averagePercentage: 65,
      highestPercentage: 80,
      lowestPercentage: 50,
    });
  });
});

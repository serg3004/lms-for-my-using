import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  createAssessmentAnswerOptionSchema,
  createAssessmentQuestionSchema,
  updateAssessmentAnswerOptionSchema,
  updateAssessmentQuestionSchema,
} from './assessment-questions.schemas.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';
import { PrismaService } from '../../database/prisma.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const questionId = '55555555-5555-5555-5555-555555555555';
const optionId = '66666666-6666-6666-6666-666666666666';

describe('Assessment questions validation', () => {
  it('accepts valid assessment question input', () => {
    const input = createAssessmentQuestionSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Safety basics',
      type: 'single_choice',
      points: 2,
      order: 1,
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Safety basics',
      type: 'single_choice',
      points: 2,
      order: 1,
      scoringMode: 'all_or_nothing',
    });
  });

  it('accepts valid assessment question input with image', () => {
    const input = createAssessmentQuestionSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Choose the safety sign',
      imageUrl: '/files/sign.png',
    });

    expect(input.imageUrl).toBe('/files/sign.png');
  });

  it('accepts valid text answer option input', () => {
    const input = createAssessmentAnswerOptionSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      text: 'Correct option',
      isCorrect: true,
      order: 0,
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      text: 'Correct option',
      isCorrect: true,
      order: 0,
    });
  });

  it('accepts valid image answer option input', () => {
    const input = createAssessmentAnswerOptionSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      imageUrl: '/files/option-a.png',
      isCorrect: true,
    });

    expect(input).toEqual({
      organizationId: '11111111-1111-1111-1111-111111111111',
      imageUrl: '/files/option-a.png',
      isCorrect: true,
      order: 0,
    });
  });

  it('rejects assessment question input without title', () => {
    expect(() =>
      createAssessmentQuestionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
      }),
    ).toThrow();
  });

  it('accepts an explicit scoringMode', () => {
    const input = createAssessmentQuestionSchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      title: 'Pick all correct',
      type: 'multiple_choice',
      scoringMode: 'proportional_with_penalty',
    });

    expect(input.scoringMode).toBe('proportional_with_penalty');
  });

  it('rejects an unknown scoringMode', () => {
    expect(() =>
      createAssessmentQuestionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        title: 'Pick all correct',
        scoringMode: 'weighted',
      }),
    ).toThrow();
  });

  it('rejects assessment question input with invalid points', () => {
    expect(() =>
      createAssessmentQuestionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        title: 'Safety basics',
        points: 0,
      }),
    ).toThrow();
  });

  it('rejects answer option without text and image', () => {
    expect(() =>
      createAssessmentAnswerOptionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
      }),
    ).toThrow();
  });

  it('rejects empty answer option text', () => {
    expect(() =>
      createAssessmentAnswerOptionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        text: '',
      }),
    ).toThrow();
  });
});

describe('AssessmentQuestionsService learner quiz', () => {
  it('loads published quiz questions without correct-answer flags', async () => {
    const findManyCalls: unknown[] = [];
    const prisma = {
      assessment: {
        findFirst: async () => ({ id: '22222222-2222-2222-2222-222222222222' }),
      },
      assessmentQuestion: {
        findMany: async (query: unknown) => {
          findManyCalls.push(query);

          return [
            {
              id: '33333333-3333-3333-3333-333333333333',
              options: [
                {
                  id: '44444444-4444-4444-4444-444444444444',
                  text: 'Option A',
                },
              ],
            },
          ];
        },
      },
    } as unknown as PrismaService;

    const service = new AssessmentQuestionsService(prisma);
    const result = await service.listLearnerQuizQuestions(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      '55555555-5555-5555-5555-555555555555',
    );

    expect(result[0]?.options[0]).not.toHaveProperty('isCorrect');
    expect(findManyCalls[0]).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          options: expect.objectContaining({
            select: expect.not.objectContaining({
              isCorrect: true,
            }),
          }),
        }),
      }),
    );
  });

  it('returns questions in stored order when randomizeOrder is off', async () => {
    const questions = [
      { id: 'q1', options: [{ id: 'q1-a' }, { id: 'q1-b' }] },
      { id: 'q2', options: [{ id: 'q2-a' }, { id: 'q2-b' }] },
      { id: 'q3', options: [{ id: 'q3-a' }, { id: 'q3-b' }] },
    ];
    const prisma = {
      assessment: { findFirst: async () => ({ id: 'assessment-1', randomizeOrder: false }) },
      assessmentQuestion: { findMany: async () => questions },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    const result = await service.listLearnerQuizQuestions('assessment-1', 'org-1', 'user-1');

    expect(result.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('shuffles question and option order deterministically per user when randomizeOrder is on', async () => {
    const questions = [
      { id: 'q1', options: [{ id: 'q1-a' }, { id: 'q1-b' }, { id: 'q1-c' }, { id: 'q1-d' }] },
      { id: 'q2', options: [{ id: 'q2-a' }, { id: 'q2-b' }, { id: 'q2-c' }, { id: 'q2-d' }] },
      { id: 'q3', options: [{ id: 'q3-a' }, { id: 'q3-b' }, { id: 'q3-c' }, { id: 'q3-d' }] },
      { id: 'q4', options: [{ id: 'q4-a' }, { id: 'q4-b' }, { id: 'q4-c' }, { id: 'q4-d' }] },
    ];
    const prisma = {
      assessment: { findFirst: async () => ({ id: 'assessment-1', randomizeOrder: true }) },
      assessmentQuestion: { findMany: async () => questions },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    const forUser1First = await service.listLearnerQuizQuestions('assessment-1', 'org-1', 'user-1');
    const forUser1Second = await service.listLearnerQuizQuestions('assessment-1', 'org-1', 'user-1');
    const forUser2 = await service.listLearnerQuizQuestions('assessment-1', 'org-1', 'user-2');

    // Same user, same assessment: stable order across reloads.
    expect(forUser1First.map((q) => q.id)).toEqual(forUser1Second.map((q) => q.id));
    // Every question and option still present — a reorder, not a loss of data.
    expect(forUser1First.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3', 'q4']);
    forUser1First.forEach((question) => {
      expect(question.options.map((o) => o.id).sort()).toEqual(
        questions.find((q) => q.id === question.id)!.options.map((o) => o.id).sort(),
      );
    });
    // Different users: different order (statistically — this seed pair happens to differ).
    expect(forUser1First.map((q) => q.id)).not.toEqual(forUser2.map((q) => q.id));
  });
});

describe('updateAssessmentQuestionSchema / updateAssessmentAnswerOptionSchema', () => {
  it('accepts a partial question update', () => {
    expect(updateAssessmentQuestionSchema.parse({ points: 5 })).toEqual({ points: 5 });
  });

  it('accepts an empty question update', () => {
    expect(updateAssessmentQuestionSchema.parse({})).toEqual({});
  });

  it('accepts a partial option update', () => {
    expect(updateAssessmentAnswerOptionSchema.parse({ isCorrect: true })).toEqual({ isCorrect: true });
  });

  it('accepts text: null to clear it on an option update', () => {
    expect(updateAssessmentAnswerOptionSchema.parse({ text: null })).toEqual({ text: null });
  });
});

describe('AssessmentQuestionsService.updateQuestion / deleteQuestion', () => {
  it('updates a question', async () => {
    const update = jest.fn(async () => ({ id: questionId, points: 5 }));
    const prisma = {
      assessmentQuestion: { findFirst: async () => ({ id: questionId }), update },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await service.updateQuestion(questionId, organizationId, { points: 5 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: questionId, organizationId }, data: { points: 5 } }));
  });

  it('throws NotFoundException when updating a missing question', async () => {
    const prisma = { assessmentQuestion: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await expect(service.updateQuestion(questionId, organizationId, { points: 5 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft-deletes a question', async () => {
    const update = jest.fn(async () => ({ id: questionId }));
    const prisma = {
      assessmentQuestion: { findFirst: async () => ({ id: questionId }), update },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await service.deleteQuestion(questionId, organizationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: questionId, organizationId }, data: { deletedAt: expect.any(Date) } }),
    );
  });
});

describe('AssessmentQuestionsService.updateAnswerOption / deleteAnswerOption', () => {
  it('updates an option', async () => {
    const update = jest.fn(async () => ({ id: optionId, isCorrect: true }));
    const prisma = {
      assessmentAnswerOption: {
        findFirst: async () => ({ id: optionId, text: 'Option A', imageUrl: null }),
        update,
      },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await service.updateAnswerOption(optionId, organizationId, { isCorrect: true });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { isCorrect: true } }));
  });

  it('rejects clearing both text and imageUrl, leaving the option with neither', async () => {
    const prisma = {
      assessmentAnswerOption: { findFirst: async () => ({ id: optionId, text: 'Option A', imageUrl: null }) },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await expect(service.updateAnswerOption(optionId, organizationId, { text: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows clearing text when imageUrl is already set', async () => {
    const update = jest.fn(async () => ({ id: optionId, text: null }));
    const prisma = {
      assessmentAnswerOption: {
        findFirst: async () => ({ id: optionId, text: 'Option A', imageUrl: '/files/a.png' }),
        update,
      },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await service.updateAnswerOption(optionId, organizationId, { text: null });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { text: null } }));
  });

  it('throws NotFoundException when updating a missing option', async () => {
    const prisma = { assessmentAnswerOption: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await expect(service.updateAnswerOption(optionId, organizationId, { isCorrect: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('soft-deletes an option', async () => {
    const update = jest.fn(async () => ({ id: optionId }));
    const prisma = {
      assessmentAnswerOption: { findFirst: async () => ({ id: optionId }), update },
    } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await service.deleteAnswerOption(optionId, organizationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: optionId, organizationId }, data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('throws NotFoundException when deleting a missing option', async () => {
    const prisma = { assessmentAnswerOption: { findFirst: async () => null } } as unknown as PrismaService;
    const service = new AssessmentQuestionsService(prisma);

    await expect(service.deleteAnswerOption(optionId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

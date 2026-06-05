import { createAssessmentAnswerOptionSchema, createAssessmentQuestionSchema } from './assessment-questions.schemas.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';
import { PrismaService } from '../../database/prisma.service.js';

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
});

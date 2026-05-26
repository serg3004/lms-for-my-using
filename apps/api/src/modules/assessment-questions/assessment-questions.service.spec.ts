import { createAssessmentAnswerOptionSchema, createAssessmentQuestionSchema } from './assessment-questions.schemas.js';

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

  it('accepts valid answer option input', () => {
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

  it('rejects empty answer option text', () => {
    expect(() =>
      createAssessmentAnswerOptionSchema.parse({
        organizationId: '11111111-1111-1111-1111-111111111111',
        text: '',
      }),
    ).toThrow();
  });
});

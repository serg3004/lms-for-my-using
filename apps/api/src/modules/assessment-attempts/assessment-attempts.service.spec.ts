import {
  createAssessmentAttemptAnswerSchema,
  createAssessmentAttemptSchema,
} from './assessment-attempts.schemas.js';

describe('Assessment attempts validation', () => {
  it('accepts valid single choice attempt input', () => {
    const input = createAssessmentAttemptSchema.parse({
      answers: [
        {
          questionId: '11111111-1111-1111-1111-111111111111',
          selectedOptionId: '22222222-2222-2222-2222-222222222222',
        },
      ],
    });

    expect(input.answers[0]).toEqual({
      questionId: '11111111-1111-1111-1111-111111111111',
      selectedOptionId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('accepts valid multiple choice answer input', () => {
    const input = createAssessmentAttemptAnswerSchema.parse({
      questionId: '11111111-1111-1111-1111-111111111111',
      selectedOptionIds: ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'],
    });

    expect(input.selectedOptionIds).toEqual([
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    ]);
  });

  it('rejects answer with both single and multiple selections', () => {
    expect(() =>
      createAssessmentAttemptAnswerSchema.parse({
        questionId: '11111111-1111-1111-1111-111111111111',
        selectedOptionId: '22222222-2222-2222-2222-222222222222',
        selectedOptionIds: ['33333333-3333-3333-3333-333333333333'],
      }),
    ).toThrow();
  });

  it('rejects answer without selected options', () => {
    expect(() =>
      createAssessmentAttemptAnswerSchema.parse({
        questionId: '11111111-1111-1111-1111-111111111111',
      }),
    ).toThrow();
  });
});

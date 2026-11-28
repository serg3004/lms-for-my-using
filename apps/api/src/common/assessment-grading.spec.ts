import { BadRequestException } from '@nestjs/common';
import { gradeAssessmentAnswers, type QuestionWithOptions } from './assessment-grading.js';

const option = (id: string, isCorrect = false) => ({ id, isCorrect });
const single: QuestionWithOptions = { id: '11111111-1111-4111-8111-111111111111', type: 'single_choice', points: 5, scoringMode: 'all_or_nothing',
  options: [option('a1111111-1111-4111-8111-111111111111', true), option('b1111111-1111-4111-8111-111111111111')] };
const multiple: QuestionWithOptions = { id: '22222222-2222-4222-8222-222222222222', type: 'multiple_choice', points: 5, scoringMode: 'all_or_nothing',
  options: [option('c1111111-1111-4111-8111-111111111111'), option('d1111111-1111-4111-8111-111111111111')] };
const text: QuestionWithOptions = { id: '33333333-3333-4333-8333-333333333333', type: 'short_answer', points: 5, scoringMode: 'all_or_nothing', options: [],
  definition: { type: 'short_answer', manualReview: true, acceptedAnswers: [], caseSensitive: false, whitespace: 'trim' } };

describe('survey grading (PR 540)', () => {
  it('keeps every answer unscored, never correct and never waiting for a reviewer', () => {
    const graded = gradeAssessmentAnswers([single, multiple, text], [
      { questionId: single.id, selectedOptionId: single.options[0]!.id },
      { questionId: multiple.id, selectedOptionIds: multiple.options.map(({ id }) => id) },
      { questionId: text.id, response: { type: 'short_answer', text: 'Fine' } },
    ], true);
    expect(graded).toEqual([
      { questionId: single.id, selectedOptionId: single.options[0]!.id, isCorrect: false, score: 0 },
      { questionId: multiple.id, selectedOptionIds: multiple.options.map(({ id }) => id), isCorrect: false, score: 0 },
      { questionId: text.id, response: { type: 'short_answer', text: 'Fine' }, isCorrect: false, score: 0 },
    ]);
  });

  it('still scores the same answer as a test', () => {
    expect(gradeAssessmentAnswers([single], [{ questionId: single.id, selectedOptionId: single.options[0]!.id }])).toMatchObject([{ isCorrect: true, score: 5 }]);
  });

  it.each([
    ['an option of another question', { questionId: single.id, selectedOptionId: multiple.options[0]!.id }],
    ['several options for one answer', { questionId: single.id, selectedOptionIds: [single.options[0]!.id] }],
    ['a text for a choice question', { questionId: single.id, response: { type: 'short_answer' as const, text: 'x' } }],
  ])('refuses %s', (_name, answer) => {
    expect(() => gradeAssessmentAnswers([single], [answer], true)).toThrow(BadRequestException);
  });

  it('refuses a question type a survey does not offer', () => {
    const matching: QuestionWithOptions = { id: '44444444-4444-4444-8444-444444444444', type: 'true_false', points: 1, scoringMode: 'all_or_nothing', options: [] };
    expect(() => gradeAssessmentAnswers([matching], [{ questionId: matching.id, response: { type: 'true_false', value: true } }], true)).toThrow('not available in a survey');
  });
});

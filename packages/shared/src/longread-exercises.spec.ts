import { describe, expect, it } from 'vitest';
import { exerciseContentSchema, submitExerciseSchema, publicExerciseQuestionSchema, writeLongreadQuestionSchema } from './longread-exercises.js';
const id = '38900000-0000-4000-8000-000000000001';
describe('longread exercise contracts', () => {
  it('defaults a draft placeholder to practice and requires explicit publication resolution', () => { expect(exerciseContentSchema.parse({})).toMatchObject({ questionId: null, mode: 'practice', maxAttempts: 3, feedback: 'result' }); });
  it.each([{ weight: 0 }, { weight: 1.5 }, { maxAttempts: 101 }, { passingScore: -1 }, { passingScore: 101 }, { feedback: 'none' }, { questionId: 'forged' }, { correctAnswer: true }])('rejects invalid settings %j', (value) => expect(exerciseContentSchema.safeParse(value).success).toBe(false));
  it('requires an idempotency key and a positive attempt ordinal; answer keys cannot be submitted', () => {
    const input = { version: 1, requestId: id, expectedAttempt: 1, answer: { questionId: id, response: { type: 'true_false', value: false } } };
    expect(submitExerciseSchema.safeParse(input).success).toBe(true);
    for (const bad of [{ ...input, expectedAttempt: 0 }, { ...input, requestId: '' }, { ...input, answer: { ...input.answer, score: 100 } }, { ...input, answer: { questionId: id, selectedOptionIds: [] } }]) expect(submitExerciseSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects leaked keys from public question projection and mismatched author definitions are checked by the server', () => {
    const question = { id, type: 'short_answer', title: 'Question', text: null, imageUrl: null, points: 8, scoringMode: 'all_or_nothing', options: [], definition: { type: 'short_answer', caseSensitive: false, whitespace: 'trim' }, assessment: { id, title: 'Test', passingScore: 70, maxAttempts: null } };
    expect(publicExerciseQuestionSchema.safeParse(question).success).toBe(true);
    expect(publicExerciseQuestionSchema.safeParse({ ...question, definition: { ...question.definition, acceptedAnswers: ['secret'] } }).success).toBe(false);
    expect(writeLongreadQuestionSchema.safeParse({ type: 'short_answer', title: 'Question', definition: { type: 'short_answer', acceptedAnswers: ['answer', 'ANSWER'], caseSensitive: false, whitespace: 'trim' } }).success).toBe(false);
  });
});

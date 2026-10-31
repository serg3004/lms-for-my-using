import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { AttemptAnswerResult } from '../../shared/api/types.js';
import { ownAnswerText, reviewedCorrectText } from './answer-text.js';
const t = ((key: string) => key) as TFunction;
const base: AttemptAnswerResult = { id: 'answer', questionId: 'question', selectedOptionId: null, selectedOptionIds: null, isCorrect: false, score: 0, question: { id: 'question', title: 'Question', type: 'single_choice', points: 8, order: 0 }, selectedOption: null };
describe('assessment result labels', () => {
  it('preserves legacy labels for image-only single and multiple choices and correct options', () => {
    const option = { id: 'image', text: null, imageUrl: 'https://example.invalid/answer.png' };
    expect(ownAnswerText({ ...base, selectedOption: option }, t)).toBe(option.imageUrl);
    expect(ownAnswerText({ ...base, selectedOptionIds: ['image'], question: { ...base.question, options: [option] } }, t)).toBe(option.imageUrl);
    expect(reviewedCorrectText({ ...base, correctOptions: [option] }, t)).toBe(option.imageUrl);
  });
  it('uses frozen matching/ordering labels and the learner’s Unicode text', () => {
    expect(ownAnswerText({ ...base, response: { type: 'matching', pairs: [{ leftId: 'a', rightId: 'b' }] }, question: { ...base.question, definition: { type: 'matching', left: [{ id: 'a', text: 'Русский' }], right: [{ id: 'b', text: 'Қазақша' }] } } }, t)).toBe('Русский → Қазақша');
    expect(ownAnswerText({ ...base, response: { type: 'ordering', itemIds: ['b', 'a'] }, question: { ...base.question, definition: { type: 'ordering', items: [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }] } } }, t)).toBe('Beta → Alpha');
    expect(ownAnswerText({ ...base, response: { type: 'short_answer', text: 'Café 中文' } }, t)).toBe('Café 中文');
    expect(ownAnswerText({ ...base, response: { type: 'fill_blank', blanks: [{ blankId: 'city', value: 'Алматы' }] } }, t)).toBe('city: Алматы');
  });
});

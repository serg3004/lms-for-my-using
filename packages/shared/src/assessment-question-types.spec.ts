import { describe, expect, it } from 'vitest';
import { questionDefinitionSchema, questionResponseSchema } from './assessment-question-types.js';

const items = [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }];
describe('assessment definitions and responses', () => {
  it.each(['bad\0text', 'bad\ud800', 'bad\udfff'])('rejects text PostgreSQL JSONB cannot store', (text) => {
    expect(questionResponseSchema.safeParse({ type: 'short_answer', text }).success).toBe(false);
    expect(questionDefinitionSchema.safeParse({ type: 'short_answer', acceptedAnswers: [text], caseSensitive: true, whitespace: 'exact' }).success).toBe(false);
  });
  it('preserves well-formed Unicode including emoji', () => {
    expect(questionResponseSchema.parse({ type: 'short_answer', text: 'Қазақша 中文 🔒' })).toMatchObject({ text: 'Қазақша 中文 🔒' });
  });
  it.each([
    { type: 'matching', left: items, right: items, correctPairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'b' }] },
    { type: 'ordering', items, correctOrder: ['b', 'a'] },
    { type: 'fill_blank', blanks: [{ id: 'city', acceptedAnswers: ['Алматы', 'Almaty'] }], caseSensitive: false, whitespace: 'trim' },
    { type: 'short_answer', acceptedAnswers: ['北京', 'Beijing'], caseSensitive: true, whitespace: 'exact' },
    { type: 'true_false', correctAnswer: false },
  ])('round-trips a valid $type definition', (value) => expect(questionDefinitionSchema.parse(value)).toEqual(value));
  it.each([
    { type: 'matching', left: items, right: items, correctPairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'a' }] },
    { type: 'matching', left: items, right: items, correctPairs: [{ leftId: 'x', rightId: 'a' }, { leftId: 'b', rightId: 'b' }] },
    { type: 'matching', left: [items[0], items[0]], right: items, correctPairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'b' }] },
    { type: 'ordering', items, correctOrder: ['a', 'a'] },
    { type: 'ordering', items, correctOrder: ['a'] },
    { type: 'ordering', items: [items[0], items[0]], correctOrder: ['a', 'b'] },
    { type: 'short_answer', acceptedAnswers: [' A ', 'a'], caseSensitive: false, whitespace: 'trim' },
    { type: 'short_answer', acceptedAnswers: ['\t '], caseSensitive: false, whitespace: 'collapse' },
    { type: 'short_answer', acceptedAnswers: [], caseSensitive: true, whitespace: 'exact' },
    { type: 'short_answer', acceptedAnswers: ['ok'], caseSensitive: 'false', whitespace: 'trim' },
    { type: 'true_false', correctAnswer: 'false' },
    { type: 'true_false', correctAnswer: false, script: 'attack()' },
    { type: 'fill_blank', blanks: [{ id: 'a', acceptedAnswers: ['A'] }, { id: 'a', acceptedAnswers: ['B'] }], caseSensitive: true, whitespace: 'exact' },
  ])('rejects a corrupt definition %#', (value) => expect(questionDefinitionSchema.safeParse(value).success).toBe(false));
  it.each([
    { type: 'short_answer', text: 'ok', score: 100 }, { type: 'true_false', value: 'true' },
    { type: 'ordering', itemIds: [] }, { type: 'matching', pairs: [{ leftId: 'a', rightId: 'b', isCorrect: true }, { leftId: 'b', rightId: 'a' }] },
  ])('rejects client grading fields and invalid primitive types %#', (value) => expect(questionResponseSchema.safeParse(value).success).toBe(false));
});

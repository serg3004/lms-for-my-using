import { BadRequestException } from '@nestjs/common';
import { gradeDefinedQuestion, publicQuestionDefinition, validateQuestionDefinition } from './assessment-question-definition.js';
import { questionDefinitionSchema, type QuestionDefinition, type QuestionResponse, type QuestionScoringMode } from '@lms/shared/assessment-question-types';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() }));
const matching = { type: 'matching', left: items, right: items, correctPairs: items.map(({ id }) => ({ leftId: id, rightId: id })) } as const;
const ordering = { type: 'ordering', items, correctOrder: items.map(({ id }) => id) } as const;
const fill = { type: 'fill_blank', blanks: items.map(({ id }) => ({ id, acceptedAnswers: [`Answer ${id}`] })), caseSensitive: false, whitespace: 'collapse' } as const;
const modes: QuestionScoringMode[] = ['all_or_nothing', 'proportional', 'proportional_with_penalty', 'per_option'];

describe('typed assessment question grading', () => {
  const examples: { definition: unknown; correct: QuestionResponse; wrong: QuestionResponse; partial: QuestionResponse; scores: number[] }[] = [
    { definition: matching, correct: { type: 'matching', pairs: matching.correctPairs }, wrong: { type: 'matching', pairs: items.map(({ id }, index) => ({ leftId: id, rightId: items[(index + 1) % 4]!.id })) }, partial: { type: 'matching', pairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'b' }, { leftId: 'c', rightId: 'd' }, { leftId: 'd', rightId: 'c' }] }, scores: [0, 4, 0, 4] },
    { definition: ordering, correct: { type: 'ordering', itemIds: ['a', 'b', 'c', 'd'] }, wrong: { type: 'ordering', itemIds: ['d', 'c', 'b', 'a'] }, partial: { type: 'ordering', itemIds: ['a', 'b', 'd', 'c'] }, scores: [0, 4, 0, 4] },
    { definition: fill, correct: { type: 'fill_blank', blanks: items.map(({ id }) => ({ blankId: id, value: `  ANSWER\t${id}  ` })) }, wrong: { type: 'fill_blank', blanks: items.map(({ id }) => ({ blankId: id, value: '' })) }, partial: { type: 'fill_blank', blanks: items.map(({ id }) => ({ blankId: id, value: id === 'd' ? 'wrong' : `Answer ${id}` })) }, scores: [0, 6, 4, 6] },
  ];
  for (const example of examples) for (const [index, mode] of modes.entries()) {
    const definition = questionDefinitionSchema.parse(example.definition);
    it(`${definition.type}: full, zero and partial answers in ${mode}`, () => {
      expect(gradeDefinedQuestion(definition.type, definition, example.correct, 8, mode)).toMatchObject({ isCorrect: true, score: 8 });
      expect(gradeDefinedQuestion(definition.type, definition, example.wrong, 8, mode)).toMatchObject({ isCorrect: false, score: 0 });
      expect(gradeDefinedQuestion(definition.type, definition, example.partial, 8, mode)).toMatchObject({ isCorrect: false, score: example.scores[index] });
    });
  }
  it.each(modes)('atomic boolean and short answer use all-or-nothing in %s', (mode) => {
    expect(gradeDefinedQuestion('true_false', { type: 'true_false', correctAnswer: false }, { type: 'true_false', value: false }, 3, mode)).toMatchObject({ score: 3, isCorrect: true });
    expect(gradeDefinedQuestion('true_false', { type: 'true_false', correctAnswer: false }, { type: 'true_false', value: true }, 3, mode)).toMatchObject({ score: 0, isCorrect: false });
    const definition = { type: 'short_answer', acceptedAnswers: ['Café', 'Coffee'], caseSensitive: false, whitespace: 'trim' };
    expect(gradeDefinedQuestion('short_answer', definition, { type: 'short_answer', text: '  CAFE\u0301  ' }, 3, mode)).toMatchObject({ score: 3, isCorrect: true });
    expect(gradeDefinedQuestion('short_answer', definition, { type: 'short_answer', text: 'Cafe' }, 3, mode)).toMatchObject({ score: 0, isCorrect: false });
  });
  it.each([
    ['exact', true, ' A  B ', true], ['exact', true, 'A  B', false], ['trim', true, '  A  B\n', true],
    ['trim', true, 'a  b', false], ['collapse', false, '\na\t b  ', true], ['collapse', true, 'a b', false],
  ] as const)('text policy %s / caseSensitive=%s, input=%s', (whitespace, caseSensitive, text, correct) => {
    const definition = { type: 'short_answer', acceptedAnswers: [' A  B '], whitespace, caseSensitive };
    expect(gradeDefinedQuestion('short_answer', definition, { type: 'short_answer', text }, 5, 'all_or_nothing').isCorrect).toBe(correct);
  });
  it.each([
    [matching, { type: 'matching', pairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'a' }, { leftId: 'c', rightId: 'c' }, { leftId: 'd', rightId: 'd' }] }],
    [matching, { type: 'matching', pairs: [{ leftId: 'a', rightId: 'a' }, { leftId: 'b', rightId: 'b' }] }],
    [ordering, { type: 'ordering', itemIds: ['a', 'b', 'c', 'x'] }],
    [ordering, { type: 'ordering', itemIds: ['a', 'b', 'c', 'c'] }],
    [fill, { type: 'fill_blank', blanks: [{ blankId: 'a', value: 'Answer a' }] }],
    [fill, { type: 'fill_blank', blanks: items.map(() => ({ blankId: 'a', value: 'Answer a' })) }],
    [ordering, { type: 'short_answer', text: 'a,b,c,d' }],
    [ordering, { type: 'ordering', itemIds: ['a', 'b', 'c', 'd'], isCorrect: true, score: 999 }],
  ])('rejects malformed/forged complete structures %#', (raw, response) => {
    const definition = questionDefinitionSchema.parse(raw);
    expect(() => gradeDefinedQuestion(definition.type, definition, response, 8, 'proportional')).toThrow(BadRequestException);
  });
  it('requires a valid same-type definition; legacy option questions need no JSON definition', () => {
    for (const type of ['single_choice', 'multiple_choice', 'true_false'] as const) expect(validateQuestionDefinition(type, null)).toBeNull();
    for (const type of ['matching', 'ordering', 'fill_blank', 'short_answer'] as const) expect(() => validateQuestionDefinition(type, null)).toThrow(BadRequestException);
    expect(() => validateQuestionDefinition('single_choice', ordering)).toThrow(BadRequestException);
    expect(() => validateQuestionDefinition('matching', ordering)).toThrow(BadRequestException);
    expect(() => validateQuestionDefinition('short_answer', { type: 'short_answer', acceptedAnswers: ['A', 'a'], caseSensitive: false, whitespace: 'trim' })).toThrow(BadRequestException);
  });
  it('learner projections omit every key and are stable without mutating definitions', () => {
    const definitions: QuestionDefinition[] = [questionDefinitionSchema.parse(matching), questionDefinitionSchema.parse(ordering), questionDefinitionSchema.parse(fill), { type: 'short_answer', acceptedAnswers: ['secret'], caseSensitive: true, whitespace: 'exact' }, { type: 'true_false', correctAnswer: false }];
    for (const definition of definitions) {
      const original = structuredClone(definition), value = publicQuestionDefinition(definition, 'learner-1');
      expect(publicQuestionDefinition(definition, 'learner-1')).toEqual(value);
      expect(JSON.stringify(value)).not.toMatch(/correctPairs|correctOrder|acceptedAnswers|correctAnswer|secret/);
      expect(definition).toEqual(original);
    }
  });
});

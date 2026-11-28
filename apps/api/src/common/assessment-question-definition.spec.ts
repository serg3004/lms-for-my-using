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

// PR 539: image drop, card sorting and matching with extra answers.
const image = JSON.stringify({ kind: 'file', fileId: '11111111-1111-4111-8111-111111111111.png', caption: '', alt: 'Plan' });
const zones = ['z1', 'z2', 'z3'].map((id, index) => ({ id, shape: 'rect' as const, x: index * 30, y: 10, width: 20, height: 20 }));
const imageDrop = { type: 'image_drop', background: image, objects: [{ id: 'o1', text: 'Valve' }, { id: 'o2', text: 'Gauge' }, { id: 'o3', text: 'Spare' }], zones,
  correctPairs: [{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o2' }, { zoneId: 'z3', objectId: 'o1' }] } as const;
const cardSort = { type: 'card_sort', categories: [{ id: 'k1', text: 'Safe' }, { id: 'k2', text: 'Unsafe' }], cards: items.map(({ id, text }) => ({ id, text })),
  correctPlacements: [{ cardId: 'a', categoryId: 'k1' }, { cardId: 'b', categoryId: 'k1' }, { cardId: 'c', categoryId: 'k2' }, { cardId: 'd', categoryId: 'k2' }] } as const;
const extras = { ...matching, right: [...items, { id: 'x', text: 'Trap' }] };

describe('PR 539 question types', () => {
  it('grades image drop per zone, allowing one object in several zones', () => {
    const grade = (placements: { zoneId: string; objectId: string }[]) => gradeDefinedQuestion('image_drop', imageDrop, { type: 'image_drop', placements }, 9, 'proportional');
    expect(grade([{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o2' }, { zoneId: 'z3', objectId: 'o1' }])).toMatchObject({ isCorrect: true, score: 9 });
    expect(grade([{ zoneId: 'z1', objectId: 'o1' }, { zoneId: 'z2', objectId: 'o3' }, { zoneId: 'z3', objectId: 'o1' }])).toMatchObject({ isCorrect: false, score: 6 });
    expect(() => grade([{ zoneId: 'z1', objectId: 'o1' }])).toThrow(BadRequestException);
    expect(() => grade([{ zoneId: 'z1', objectId: 'nope' }, { zoneId: 'z2', objectId: 'o2' }, { zoneId: 'z3', objectId: 'o1' }])).toThrow(BadRequestException);
  });
  it('grades card sorting per card and rejects missing or unknown placements', () => {
    const grade = (placements: { cardId: string; categoryId: string }[], mode: QuestionScoringMode = 'proportional') => gradeDefinedQuestion('card_sort', cardSort, { type: 'card_sort', placements }, 8, mode);
    expect(grade(cardSort.correctPlacements.map((value) => ({ ...value })))).toMatchObject({ isCorrect: true, score: 8 });
    expect(grade(cardSort.correctPlacements.map((value) => ({ ...value, categoryId: value.cardId === 'd' ? 'k1' : value.categoryId })))).toMatchObject({ isCorrect: false, score: 6 });
    expect(grade(cardSort.correctPlacements.map((value) => ({ ...value, categoryId: 'k2' })), 'all_or_nothing')).toMatchObject({ isCorrect: false, score: 0 });
    expect(() => grade([{ cardId: 'a', categoryId: 'k1' }, { cardId: 'b', categoryId: 'k1' }])).toThrow(BadRequestException);
    expect(() => grade(cardSort.correctPlacements.map((value) => ({ ...value, categoryId: 'k9' })))).toThrow(BadRequestException);
  });
  it('accepts free-shape zones and picture objects, and rejects points on other shapes', () => {
    const shaped = { ...imageDrop, zones: [{ ...zones[0], shape: 'polygon', points: [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }, zones[1], zones[2]],
      objects: [{ id: 'o1', text: '', image }, imageDrop.objects[1], imageDrop.objects[2]] };
    expect(questionDefinitionSchema.safeParse(shaped).success).toBe(true);
    expect(questionDefinitionSchema.safeParse({ ...shaped, zones: [{ ...shaped.zones[0], points: shaped.zones[0].points!.slice(0, 2) }, zones[1], zones[2]] }).success).toBe(false);
    expect(questionDefinitionSchema.safeParse({ ...shaped, zones: [{ ...zones[0], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, zones[1], zones[2]] }).success).toBe(false);
    expect(questionDefinitionSchema.safeParse({ ...shaped, zones: [{ ...shaped.zones[0], points: undefined }, zones[1], zones[2]] }).success).toBe(false);
    expect(questionDefinitionSchema.safeParse({ ...shaped, objects: [{ id: 'o1', text: '' }, imageDrop.objects[1], imageDrop.objects[2]] }).success).toBe(false);
  });
  it('does not leak the answer key of the new types to the learner', () => {
    const imagePublic = JSON.stringify(publicQuestionDefinition(questionDefinitionSchema.parse(imageDrop), 'seed'));
    expect(imagePublic).not.toContain('correctPairs');
    expect(JSON.stringify(publicQuestionDefinition(questionDefinitionSchema.parse(cardSort), 'seed'))).not.toContain('correctPlacements');
  });
  it('rejects broken definitions of the new types', () => {
    const bad = [
      { ...imageDrop, correctPairs: imageDrop.correctPairs.slice(0, 2) },
      { ...imageDrop, correctPairs: [...imageDrop.correctPairs.slice(0, 2), { zoneId: 'z3', objectId: 'gone' }] },
      { ...imageDrop, zones: [{ ...zones[0], x: 95 }, zones[1], zones[2]] },
      { ...imageDrop, background: JSON.stringify({ kind: 'link', url: 'https://example.com/a.png', caption: '', alt: '' }) },
      { ...cardSort, categories: [{ id: 'k1', text: 'Only' }] },
      { ...cardSort, categories: [...'12345'].map((id) => ({ id: `k${id}`, text: id })) },
      { ...cardSort, correctPlacements: cardSort.correctPlacements.slice(0, 3) },
      { ...cardSort, cards: [{ id: 'a', text: '' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }] },
    ];
    for (const value of bad) expect(questionDefinitionSchema.safeParse(value).success).toBe(false);
  });
  it('matching accepts extra right-hand answers and rejects a reused or foreign answer', () => {
    const definition = questionDefinitionSchema.parse(extras);
    const pairs = matching.correctPairs.map((value) => ({ ...value }));
    expect(gradeDefinedQuestion('matching', definition, { type: 'matching', pairs }, 4, 'proportional')).toMatchObject({ isCorrect: true, score: 4 });
    expect(gradeDefinedQuestion('matching', definition, { type: 'matching', pairs: pairs.map((value) => value.leftId === 'd' ? { ...value, rightId: 'x' } : value) }, 4, 'proportional')).toMatchObject({ isCorrect: false, score: 3 });
    expect(() => gradeDefinedQuestion('matching', definition, { type: 'matching', pairs: pairs.map((value) => value.leftId === 'd' ? { ...value, rightId: 'a' } : value) }, 4, 'proportional')).toThrow(BadRequestException);
    expect(questionDefinitionSchema.safeParse({ ...extras, correctPairs: matching.correctPairs.map((value) => value.leftId === 'd' ? { ...value, rightId: 'zzz' } : value) }).success).toBe(false);
  });
});

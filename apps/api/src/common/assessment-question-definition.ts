import { BadRequestException } from '@nestjs/common';
import { questionDefinitionSchema, questionResponseSchema, normalizeQuestionText, type QuestionDefinition, type QuestionType, type QuestionScoringMode, type PublicQuestionDefinition } from '@lms/shared/assessment-question-types';
import { seededShuffle } from './seeded-shuffle.js';

export function validateQuestionDefinition(type: QuestionType, raw: unknown): QuestionDefinition | null {
  if (raw === undefined || raw === null) {
    if (['single_choice', 'multiple_choice', 'true_false'].includes(type)) return null;
    throw new BadRequestException('This question type requires a definition');
  }
  const parsed = questionDefinitionSchema.safeParse(raw);
  if (!parsed.success || parsed.data.type !== type) throw new BadRequestException('Invalid question definition for this type');
  return parsed.data;
}

/** Explicit allowlist: no answer key can enter the learner's quiz projection. */
export function publicQuestionDefinition(definition: QuestionDefinition, seed: string): PublicQuestionDefinition {
  switch (definition.type) {
    case 'true_false': return { type: definition.type };
    case 'matching': return { type: definition.type, left: seededShuffle(definition.left, `${seed}:left`), right: seededShuffle(definition.right, `${seed}:right`) };
    case 'ordering': return { type: definition.type, items: seededShuffle(definition.items, `${seed}:items`) };
    case 'fill_blank': return { type: definition.type, blanks: definition.blanks.map(({ id }) => ({ id })), caseSensitive: definition.caseSensitive, whitespace: definition.whitespace };
    case 'short_answer': return { type: definition.type, caseSensitive: definition.caseSensitive, whitespace: definition.whitespace };
  }
}

export function gradeDefinedQuestion(type: QuestionType, rawDefinition: unknown, rawResponse: unknown, points: number, mode: QuestionScoringMode) {
  const definition = validateQuestionDefinition(type, rawDefinition);
  const parsed = questionResponseSchema.safeParse(rawResponse);
  if (!definition || !parsed.success || parsed.data.type !== type) throw new BadRequestException('Response does not match question type');
  const response = parsed.data;
  const fullSet = (actual: string[], expected: string[]) => actual.length === expected.length && new Set(actual).size === actual.length && actual.every((id) => expected.includes(id));
  const invalid = () => { throw new BadRequestException('Response must contain every question item exactly once'); };
  let correct: number; let total = 1;
  if (definition.type === 'true_false' && response.type === 'true_false') correct = Number(response.value === definition.correctAnswer);
  else if (definition.type === 'short_answer' && response.type === 'short_answer') correct = Number(definition.acceptedAnswers.some((answer) => normalizeQuestionText(answer, definition) === normalizeQuestionText(response.text, definition)));
  else if (definition.type === 'matching' && response.type === 'matching') {
    if (!fullSet(response.pairs.map((pair) => pair.leftId), definition.left.map((item) => item.id)) || !fullSet(response.pairs.map((pair) => pair.rightId), definition.right.map((item) => item.id))) invalid();
    total = definition.left.length;
    correct = response.pairs.filter((pair) => definition.correctPairs.some((key) => key.leftId === pair.leftId && key.rightId === pair.rightId)).length;
  } else if (definition.type === 'ordering' && response.type === 'ordering') {
    if (!fullSet(response.itemIds, definition.items.map((item) => item.id))) invalid();
    total = definition.items.length;
    correct = response.itemIds.filter((id, index) => id === definition.correctOrder[index]).length;
  } else if (definition.type === 'fill_blank' && response.type === 'fill_blank') {
    if (!fullSet(response.blanks.map((blank) => blank.blankId), definition.blanks.map((blank) => blank.id))) invalid();
    total = definition.blanks.length;
    correct = response.blanks.filter((blank) => definition.blanks.find((key) => key.id === blank.blankId)!.acceptedAnswers.some((answer) => normalizeQuestionText(answer, definition) === normalizeQuestionText(blank.value, definition))).length;
  } else throw new BadRequestException('Response does not match definition');
  const isCorrect = correct === total;
  // Atomic questions never receive partial credit, matching legacy single/boolean grading.
  const score = total === 1 || mode === 'all_or_nothing' ? isCorrect ? points : 0
    : Math.round(points * (mode === 'proportional_with_penalty' ? Math.max(0, correct - (total - correct)) : correct) / total);
  return { response, isCorrect, score };
}

import type { QuestionDefinition, QuestionType } from '@lms/shared/assessment-question-types';

export function emptyQuestionDefinition(type: QuestionType): QuestionDefinition | null {
  if (type === 'single_choice' || type === 'multiple_choice') return null;
  const a = crypto.randomUUID(), b = crypto.randomUUID(), c = crypto.randomUUID(), d = crypto.randomUUID();
  const definitions: Record<Exclude<QuestionType, 'single_choice' | 'multiple_choice'>, QuestionDefinition> = {
    true_false: { type: 'true_false', correctAnswer: true },
    matching: { type: 'matching', left: [{ id: a, text: '' }, { id: b, text: '' }], right: [{ id: c, text: '' }, { id: d, text: '' }], correctPairs: [{ leftId: a, rightId: c }, { leftId: b, rightId: d }] },
    ordering: { type: 'ordering', items: [{ id: a, text: '' }, { id: b, text: '' }], correctOrder: [a, b] },
    fill_blank: { type: 'fill_blank', blanks: [{ id: 'blank-1', acceptedAnswers: [''] }], caseSensitive: false, whitespace: 'trim' },
    short_answer: { type: 'short_answer', acceptedAnswers: [''], caseSensitive: false, whitespace: 'trim' },
    // PR 539: the picture is chosen by the author; until then the server refuses to save the question.
    image_drop: { type: 'image_drop', background: '', objects: [{ id: a, text: '' }], zones: [{ id: b, shape: 'rect', x: 10, y: 10, width: 30, height: 20 }], correctPairs: [{ zoneId: b, objectId: a }] },
    card_sort: { type: 'card_sort', categories: [{ id: a, text: '' }, { id: b, text: '' }], cards: [{ id: c, text: '' }, { id: d, text: '' }], correctPlacements: [{ cardId: c, categoryId: a }, { cardId: d, categoryId: b }] },
  };
  return definitions[type];
}

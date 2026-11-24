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
  };
  return definitions[type];
}

import { describe, expect, it } from 'vitest';
import { appendOption, assessmentFormReducer, assessmentToForm, buildPreviewQuestionsWithOptions, describePreviewAnswerSelection, emptyAssessmentForm, mapAssessmentForm, type AnswerOption, type Question } from './model.js';

describe('assessment builder model', () => {
  it('maps and normalizes a valid form', () => {
    expect(mapAssessmentForm({ ...emptyAssessmentForm(), title: '  Safety Basics  ', description: '  Intro ', maxAttempts: '3' })).toEqual({ title: 'Safety Basics', slug: 'safety-basics', description: 'Intro', passingScore: 70, maxAttempts: 3, availableAfterCourseCompletion: true, randomizeOrder: false, status: 'draft' });
  });
  it.each([{ title: '' }, { passingScore: '101' }, { passingScore: '1.5' }, { maxAttempts: '0' }])('rejects invalid values: %o', (patch) => {
    expect(mapAssessmentForm({ ...emptyAssessmentForm(), title: 'Test', ...patch })).toBeNull();
  });
  it('initializes edit values and resets reducer state', () => {
    const form = assessmentToForm({ id: 'a', slug: 'a', title: 'A', description: null, passingScore: 80, maxAttempts: null, availableAfterCourseCompletion: false, randomizeOrder: true, status: 'published' });
    expect(form).toMatchObject({ title: 'A', description: '', passingScore: '80', maxAttempts: '', randomizeOrder: true, status: 'published' });
    expect(assessmentFormReducer(form, { type: 'reset' })).toEqual(emptyAssessmentForm());
  });
  it('updates one field and appends an option immutably', () => {
    expect(assessmentFormReducer(emptyAssessmentForm(), { type: 'change', field: 'title', value: 'Quiz' }).title).toBe('Quiz');
    expect(appendOption({}, 'q1', { id: 'o1', text: 'Yes', imageUrl: null, isCorrect: true, order: 0 }).q1).toHaveLength(1);
  });
});

describe('buildPreviewQuestionsWithOptions', () => {
  it('joins questions with their options and fills in the questionId back-reference', () => {
    const questions: Question[] = [{ id: 'q1', organizationId: 'org-1', type: 'single_choice', title: 'Q1', text: null, points: 1, order: 0 }];
    const options: Record<string, AnswerOption[]> = { q1: [{ id: 'o1', text: 'Yes', imageUrl: null, isCorrect: true, order: 0 }] };

    expect(buildPreviewQuestionsWithOptions(questions, options)).toEqual([
      { ...questions[0], options: [{ id: 'o1', text: 'Yes', imageUrl: null, isCorrect: true, order: 0, questionId: 'q1' }] },
    ]);
  });

  it('defaults to an empty options array when a question has no entry', () => {
    const questions: Question[] = [{ id: 'q1', organizationId: 'org-1', type: 'single_choice', title: 'Q1', text: null, points: 1, order: 0 }];

    expect(buildPreviewQuestionsWithOptions(questions, {})[0].options).toEqual([]);
  });
});

describe('describePreviewAnswerSelection', () => {
  const options: AnswerOption[] = [
    { id: 'o1', text: 'Yes', imageUrl: null, isCorrect: true, order: 0 },
    { id: 'o2', text: 'No', imageUrl: null, isCorrect: false, order: 1 },
  ];

  it('resolves a single-choice selection to its option label', () => {
    expect(describePreviewAnswerSelection({ questionId: 'q1', selectedOptionId: 'o1', isCorrect: true, score: 1 }, options)).toBe('Yes');
  });

  it('joins multiple-choice selections with a comma', () => {
    expect(describePreviewAnswerSelection({ questionId: 'q1', selectedOptionIds: ['o1', 'o2'], isCorrect: false, score: 0 }, options)).toBe('Yes, No');
  });

  it('falls back to an em dash when nothing was selected or the option is unknown', () => {
    expect(describePreviewAnswerSelection({ questionId: 'q1', isCorrect: false, score: 0 }, options)).toBe('—');
    expect(describePreviewAnswerSelection({ questionId: 'q1', selectedOptionId: 'missing', isCorrect: false, score: 0 }, options)).toBe('—');
  });
});

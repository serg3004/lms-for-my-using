import { describe, expect, it } from 'vitest';
import { appendOption, assessmentFormReducer, assessmentToForm, emptyAssessmentForm, mapAssessmentForm } from './model.js';

describe('assessment builder model', () => {
  it('maps and normalizes a valid form', () => {
    expect(mapAssessmentForm({ ...emptyAssessmentForm(), title: '  Safety Basics  ', description: '  Intro ', maxAttempts: '3' })).toEqual({ title: 'Safety Basics', slug: 'safety-basics', description: 'Intro', passingScore: 70, maxAttempts: 3, availableAfterCourseCompletion: true, status: 'draft' });
  });
  it.each([{ title: '' }, { passingScore: '101' }, { passingScore: '1.5' }, { maxAttempts: '0' }])('rejects invalid values: %o', (patch) => {
    expect(mapAssessmentForm({ ...emptyAssessmentForm(), title: 'Test', ...patch })).toBeNull();
  });
  it('initializes edit values and resets reducer state', () => {
    const form = assessmentToForm({ id: 'a', slug: 'a', title: 'A', description: null, passingScore: 80, maxAttempts: null, availableAfterCourseCompletion: false, status: 'published' });
    expect(form).toMatchObject({ title: 'A', description: '', passingScore: '80', maxAttempts: '', status: 'published' });
    expect(assessmentFormReducer(form, { type: 'reset' })).toEqual(emptyAssessmentForm());
  });
  it('updates one field and appends an option immutably', () => {
    expect(assessmentFormReducer(emptyAssessmentForm(), { type: 'change', field: 'title', value: 'Quiz' }).title).toBe('Quiz');
    expect(appendOption({}, 'q1', { id: 'o1', text: 'Yes', isCorrect: true, order: 0 }).q1).toHaveLength(1);
  });
});

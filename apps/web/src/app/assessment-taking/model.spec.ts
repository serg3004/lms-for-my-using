import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../../shared/apiClient.js';
import {
  buildAssessmentAnswers,
  computeSecondsLeft,
  countAnsweredQuestions,
  getAnswerOutcome,
  getAssessmentOptionLabel,
  getAssessmentSubmitErrorKey,
  selectedIds,
  supportsOptionQuestion,
  supportsTakingQuestion,
  type SelectedAnswers,
  type QuestionWithOptions,
} from './model.js';

const questions: QuestionWithOptions[] = [
  {
    id: 'single', type: 'single_choice', title: 'Single', text: null, points: 1, order: 1,
    options: [{ id: 'one', questionId: 'single', text: 'One', imageUrl: null, order: 1 }],
  },
  {
    id: 'multiple', type: 'multiple_choice', title: 'Multiple', text: null, points: 2, order: 2,
    options: [{ id: 'two', questionId: 'multiple', text: null, imageUrl: '/two.png', order: 1 }],
  },
  {
    id: 'boolean', type: 'true_false', title: 'Boolean', text: null, points: 1, order: 3,
    options: [{ id: 'true', questionId: 'boolean', text: null, imageUrl: null, order: 1 }],
  },
];

describe('assessment taking model', () => {
  it('keeps typed questions out of the legacy option-id form instead of treating them as single choice', () => {
    for (const type of ['matching', 'ordering', 'fill_blank', 'short_answer'] as const) {
      const question = { ...questions[0]!, type };
      expect(supportsOptionQuestion(question)).toBe(false);
      expect(() => buildAssessmentAnswers([question], { [question.id]: 'forged-option' })).toThrow('typed response');
    }
    expect(supportsOptionQuestion({ type: 'true_false', definition: { type: 'true_false' } })).toBe(false);
    expect(supportsOptionQuestion(questions[2]!)).toBe(true);
  });
  it('accepts valid typed questions and rejects wrong or missing public definitions', () => {
    const question: QuestionWithOptions = { ...questions[2]!, definition: { type: 'true_false' }, options: [] };
    expect(supportsTakingQuestion(question)).toBe(true);
    expect(supportsTakingQuestion(questions[0]!)).toBe(true);
    expect(supportsTakingQuestion({ ...question, type: 'short_answer' })).toBe(false);
    expect(supportsTakingQuestion({ ...question, type: 'ordering', definition: null })).toBe(false);
  });

  it('sends a complete typed response without legacy option IDs', () => {
    const question: QuestionWithOptions = { ...questions[2]!, definition: { type: 'true_false' }, options: [] };
    const answer: SelectedAnswers = { [question.id]: { type: 'true_false', value: false } };
    expect(countAnsweredQuestions([question], answer)).toBe(1);
    expect(buildAssessmentAnswers([question], answer)).toEqual([{ questionId: question.id, response: { type: 'true_false', value: false } }]);
    expect(countAnsweredQuestions([question], { [question.id]: ['option-id'] })).toBe(0);
    expect(countAnsweredQuestions([question], { [question.id]: 'option-id' })).toBe(0);
    expect(() => buildAssessmentAnswers([question], {})).toThrow('typed response');
  });

  it('requires all positions in an ordering response before submission', () => {
    const question: QuestionWithOptions = {
      ...questions[0]!, type: 'ordering', options: [],
      definition: { type: 'ordering', items: [{ id: 'first', text: 'First' }, { id: 'second', text: 'Second' }] },
    };
    const partial: SelectedAnswers = { [question.id]: { type: 'ordering', itemIds: ['first', ''] } };
    expect(countAnsweredQuestions([question], partial)).toBe(0);
    expect(() => buildAssessmentAnswers([question], partial)).toThrow('typed response');

    const complete: SelectedAnswers = { [question.id]: { type: 'ordering', itemIds: ['second', 'first'] } };
    expect(countAnsweredQuestions([question], complete)).toBe(1);
    expect(buildAssessmentAnswers([question], complete)).toEqual([{ questionId: question.id, response: { type: 'ordering', itemIds: ['second', 'first'] } }]);
  });

  it('normalizes only arrays as multiple-choice selections', () => {
    expect(selectedIds(['one', 'two'])).toEqual(['one', 'two']);
    expect(selectedIds('one')).toEqual([]);
    expect(selectedIds(undefined)).toEqual([]);
  });

  it('maps single, multiple and unanswered values to the attempt contract', () => {
    expect(buildAssessmentAnswers(questions, { single: 'one', multiple: ['two'] })).toEqual([
      { questionId: 'single', selectedOptionId: 'one' },
      { questionId: 'multiple', selectedOptionIds: ['two'] },
      { questionId: 'boolean', selectedOptionId: undefined },
    ]);
  });

  it('counts only non-empty answers', () => {
    expect(countAnsweredQuestions(questions, { single: 'one', multiple: [], boolean: 'true' })).toBe(2);
    expect(countAnsweredQuestions(questions, { multiple: ['two'] })).toBe(1);
    expect(countAnsweredQuestions(questions, {})).toBe(0);
  });

  it.each([
    [new ApiClientError('Unauthorized', 401), 'assessments.sessionExpired'],
    [new ApiClientError('Assessment retry cooldown is active', 400), 'assessments.policy.cooldownActive'],
    [new ApiClientError('Assessment is not open yet', 400), 'assessments.policy.notOpen'],
    [new ApiClientError('Assessment availability has ended', 400), 'assessments.policy.closed'],
    [new ApiClientError('Attempts limit reached', 400), 'assessments.errorAttemptsLimit'],
    [new ApiClientError('Course must be completed', 400), 'assessments.errorCourseNotComplete'],
    [new ApiClientError('Assessment must be published', 400), 'assessments.errorNotPublished'],
    [new ApiClientError('Other bad request', 400), 'assessments.errorSubmit'],
    [new Error('Network error'), 'assessments.errorSubmit'],
  ])('maps submit error %# to %s', (error, expected) => {
    expect(getAssessmentSubmitErrorKey(error)).toBe(expected);
  });

  it('prefers option text, then image URL, then the stable id', () => {
    expect(getAssessmentOptionLabel({ id: 'id', text: 'Text', imageUrl: '/image.png' })).toBe('Text');
    expect(getAssessmentOptionLabel({ id: 'id', text: null, imageUrl: '/image.png' })).toBe('/image.png');
    expect(getAssessmentOptionLabel({ id: 'id', text: null, imageUrl: null })).toBe('id');
  });

  it('computes the remaining seconds from a server-trusted startedAt', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const now = new Date('2026-01-01T00:05:00.000Z').getTime(); // 5 minutes elapsed

    expect(computeSecondsLeft(startedAt, 10, now)).toBe(5 * 60);
  });

  it('never goes negative once the time limit has passed', () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    const now = new Date('2026-01-01T00:20:00.000Z').getTime(); // 20 minutes elapsed, 10-minute limit

    expect(computeSecondsLeft(startedAt, 10, now)).toBe(0);
  });
});

describe('getAnswerOutcome', () => {
  it('reports an exact match as correct regardless of score', () => {
    expect(getAnswerOutcome({ isCorrect: true, score: 2 })).toBe('correct');
  });

  it('reports a non-exact match with partial credit as partial', () => {
    expect(getAnswerOutcome({ isCorrect: false, score: 0.5 })).toBe('partial');
  });

  it('reports a zero-score non-exact match as incorrect', () => {
    expect(getAnswerOutcome({ isCorrect: false, score: 0 })).toBe('incorrect');
  });
});

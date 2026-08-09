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

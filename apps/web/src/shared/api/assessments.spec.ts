import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import {
  getAssessment,
  getAssessmentPath,
  getAttemptResult,
  listAssessmentAttempts,
  listAssessmentQuestions,
  listAssessments,
  startAssessmentAttempt,
} from './assessments.js';

describe('assessments api paths', () => {
  it('builds assessment detail path for a regular id', () => {
    expect(getAssessmentPath('assessment-1')).toBe('/assessments/assessment-1');
  });

  it('encodes assessment ids before adding them to the path', () => {
    expect(getAssessmentPath('assessment 1/2')).toBe('/assessments/assessment%201%2F2');
  });
});

describe('assessments api requests', () => {
  it('lists assessments', () => {
    listAssessments();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/assessments');
  });

  it('fetches a single assessment', () => {
    getAssessment('assessment-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/assessments/assessment-1');
  });

  it('fetches an attempt result', () => {
    getAttemptResult('attempt-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/attempts/attempt-1/result');
  });

  it('lists attempts for an assessment', () => {
    listAssessmentAttempts('assessment-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/assessments/assessment-1/attempts');
  });

  it('lists questions for an assessment', () => {
    listAssessmentQuestions('assessment-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/assessments/assessment-1/questions');
  });

  it('starts a timed assessment attempt', () => {
    startAssessmentAttempt('assessment-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/assessments/assessment-1/attempts/start', { method: 'POST' });
  });
});

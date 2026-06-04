import { apiRequest } from '../apiClient.js';

import type { AssessmentAttemptResult, AssessmentSummary, CreateAttemptAnswerInput } from './types.js';

const assessmentsPath = '/assessments';

export function getAssessmentPath(assessmentId: string) {
  return `${assessmentsPath}/${encodeURIComponent(assessmentId)}`;
}

export function listAssessments() {
  return apiRequest<AssessmentSummary[]>(assessmentsPath);
}

export function getAssessment(assessmentId: string) {
  return apiRequest<AssessmentSummary>(getAssessmentPath(assessmentId));
}

export function createAssessmentAttempt(assessmentId: string, answers: CreateAttemptAnswerInput[]) {
  return apiRequest<{ id: string }>(`/assessments/${encodeURIComponent(assessmentId)}/attempts`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function getAttemptResult(attemptId: string) {
  return apiRequest<AssessmentAttemptResult>(`/attempts/${encodeURIComponent(attemptId)}/result`);
}

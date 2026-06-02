import { apiRequest } from '../apiClient.js';

import type { AssessmentSummary } from './types.js';

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

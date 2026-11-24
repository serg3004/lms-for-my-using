import { apiRequest } from '../apiClient.js';

import type {
  AssessmentAttemptResult,
  AssessmentAttemptSummary,
  AssessmentQuestionSummary,
  AssessmentSummary,
  CreateAttemptAnswerInput,
  RecordedAssessmentAnswer,
} from './types.js';

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

export function assessmentTokenQuery(token?: string) {
  return token ? `?token=${encodeURIComponent(token)}` : '';
}

export function listMyAssessments() {
  return apiRequest<Array<{
    assessment: Pick<AssessmentSummary, 'id' | 'title' | 'courseId' | 'maxAttempts' | 'passingScore'>;
    dueAt: string | null;
    questionCount: number;
    attemptsUsed: number;
    inProgress?: boolean;
    pendingReview?: boolean;
    lastCompletedAttemptId: string | null;
    bestPercentage: number | null;
    completed: boolean;
  }>>('/assessments/standalone/mine');
}

export function createAssessmentAttempt(assessmentId: string, answers: CreateAttemptAnswerInput[], token?: string, attemptId?: string) {
  return apiRequest<{ id: string }>(`/assessments/${encodeURIComponent(assessmentId)}/attempts${assessmentTokenQuery(token)}`, {
    method: 'POST',
    body: JSON.stringify({ answers, ...(attemptId ? { attemptId } : {}) }),
  });
}

export function startAssessmentAttempt<T = never>(assessmentId: string, token?: string, draft = false, resume?: string) {
  const params = new URLSearchParams(assessmentTokenQuery(token));
  if (draft) params.set('draft', 'true');
  if (resume) params.set('resume', resume);
  return apiRequest<AssessmentAttemptSummary & { questions?: T[]; serverNow?: string }>(`/assessments/${encodeURIComponent(assessmentId)}/attempts/start${params.size ? `?${params}` : ''}`, {
    method: 'POST',
  });
}

export function recordAssessmentAnswer(assessmentId: string, attemptId: string, answer: CreateAttemptAnswerInput, token?: string) {
  return apiRequest<RecordedAssessmentAnswer>(`${getAssessmentPath(assessmentId)}/attempts/answer${assessmentTokenQuery(token)}`, {
    method: 'POST', body: JSON.stringify({ attemptId, answer }),
  });
}

export function saveAssessmentDraftAnswer(assessmentId: string, attemptId: string, answer: CreateAttemptAnswerInput | { questionId: string; clear: true }, token?: string) {
  return apiRequest(`${getAssessmentPath(assessmentId)}/attempts/answer${assessmentTokenQuery(token)}`, {
    method: 'POST', body: JSON.stringify({ attemptId, answer }),
  });
}

export function listAssessmentAttempts(assessmentId: string) {
  return apiRequest<AssessmentAttemptSummary[]>(`${getAssessmentPath(assessmentId)}/attempts`);
}

export function listAssessmentQuestions(assessmentId: string) {
  return apiRequest<AssessmentQuestionSummary[]>(`${getAssessmentPath(assessmentId)}/questions`);
}

export function getAttemptResult(attemptId: string) {
  return apiRequest<AssessmentAttemptResult>(`/attempts/${encodeURIComponent(attemptId)}/result`);
}

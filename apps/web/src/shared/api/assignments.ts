import { apiRequest } from '../apiClient.js';

import type { AssignmentSummary, PaginatedResponse } from './types.js';

const assignmentsPath = '/assignments';

export type { AssignmentSummary };

export function getAssignmentPath(assignmentId: string) {
  return `${assignmentsPath}/${encodeURIComponent(assignmentId)}`;
}

export function listAssignments(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<AssignmentSummary>>(`${assignmentsPath}${qs}`);
}

export function getAssignment(assignmentId: string) {
  return apiRequest<AssignmentSummary>(getAssignmentPath(assignmentId));
}

export type CreateAssignmentInput = {
  organizationId: string;
  courseId: string;
  userId?: string;
  groupId?: string;
  dueAt?: string;
};

export function createAssignment(input: CreateAssignmentInput) {
  return apiRequest<AssignmentSummary>(assignmentsPath, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

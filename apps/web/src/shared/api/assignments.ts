import { apiRequest } from '../apiClient.js';
import type { AssignmentSummary } from '../apiClient.js';

const assignmentsPath = '/assignments';

export type { AssignmentSummary };

export function getAssignmentPath(assignmentId: string) {
  return `${assignmentsPath}/${encodeURIComponent(assignmentId)}`;
}

export function listAssignments() {
  return apiRequest<AssignmentSummary[]>(assignmentsPath);
}

export function getAssignment(assignmentId: string) {
  return apiRequest<AssignmentSummary>(getAssignmentPath(assignmentId));
}

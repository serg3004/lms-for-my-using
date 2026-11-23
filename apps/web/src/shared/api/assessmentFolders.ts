import type { FolderColor } from '@lms/shared/constants/folder-colors';
import { apiRequest } from '../apiClient.js';

export type AssessmentFolder = {
  id: string;
  name: string;
  parentId: string | null;
  color?: FolderColor;
  childFolderCount: number;
  assessmentCount: number;
  totalAssessmentCount: number;
};

export type AssessmentFolderImpact = { folders: number; movedToRoot: { id: string; title: string }[] };
export type FolderBulkKind = 'assessment' | 'folder';
export type FolderBulkOperation = { action: 'move'; parentId: string | null } | { action: 'delete' };
export type AssessmentFolderBulkResult = {
  done: number;
  skipped: number;
  results: ({ id: string; result: 'done' } |
    { id: string; result: 'skipped'; reason: 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent' | 'longread_exercise' | 'attempt_in_progress' })[];
};

const path = '/assessment-folders';
const folderPath = (id: string) => `${path}/${encodeURIComponent(id)}`;

export function listAssessmentFolders(signal?: AbortSignal) {
  return apiRequest<{ folders: AssessmentFolder[]; rootAssessmentCount: number; assessmentCount: number }>(path, { signal });
}

export function saveAssessmentFolder(id: string | null, input: { name: string; color: FolderColor; parentId?: string | null }) {
  return apiRequest<AssessmentFolder>(id === null ? path : folderPath(id), {
    method: id === null ? 'POST' : 'PATCH', body: JSON.stringify(input),
  });
}

export function getAssessmentFolderImpact(id: string) {
  return apiRequest<AssessmentFolderImpact>(`${folderPath(id)}/delete-impact`);
}

export function bulkAssessmentFolders(kind: FolderBulkKind, ids: string[], operation: FolderBulkOperation) {
  return apiRequest<AssessmentFolderBulkResult>(`${path}/bulk`, {
    method: 'POST', body: JSON.stringify({ ...operation, kind, ids }),
  });
}

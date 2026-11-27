import type { FolderColor } from '@lms/shared/constants/folder-colors';
import { apiRequest } from '../apiClient.js';

/** PR 581, 582: the sections whose list has folders in one shared table (courses, assignments, materials). */
export type LibraryFolderScope = 'course' | 'assignment' | 'material';

export type LibraryFolder = {
  id: string;
  name: string;
  parentId: string | null;
  color?: FolderColor;
  childFolderCount: number;
  itemCount: number;
  totalItemCount: number;
};

export type LibraryFolderImpact = { folders: number; movedToRoot: { id: string; title: string }[] };
export type LibraryBulkKind = 'item' | 'folder';
export type LibraryBulkOperation = { action: 'move'; parentId: string | null } | { action: 'delete' };
export type LibraryBulkResult = {
  done: number;
  skipped: number;
  results: ({ id: string; result: 'done' } |
    { id: string; result: 'skipped'; reason: 'not_found' | 'forbidden' | 'name_conflict' | 'too_deep' | 'cycle' | 'already_in_folder' | 'covered_by_parent' })[];
};

const path = '/library-folders';
const folderPath = (id: string) => `${path}/${encodeURIComponent(id)}`;

export function listLibraryFolders(scope: LibraryFolderScope, signal?: AbortSignal) {
  return apiRequest<{ folders: LibraryFolder[]; rootItemCount: number; itemCount: number }>(`${path}?scope=${scope}`, { signal });
}

export function saveLibraryFolder(scope: LibraryFolderScope, id: string | null, input: { name: string; color: FolderColor; parentId?: string | null }) {
  return apiRequest<LibraryFolder>(id === null ? path : folderPath(id), {
    method: id === null ? 'POST' : 'PATCH', body: JSON.stringify(id === null ? { ...input, scope } : input),
  });
}

export function getLibraryFolderImpact(id: string) {
  return apiRequest<LibraryFolderImpact>(`${folderPath(id)}/delete-impact`);
}

export function bulkLibraryFolders(scope: LibraryFolderScope, kind: LibraryBulkKind, ids: string[], operation: LibraryBulkOperation) {
  return apiRequest<LibraryBulkResult>(`${path}/bulk`, { method: 'POST', body: JSON.stringify({ ...operation, scope, kind, ids }) });
}

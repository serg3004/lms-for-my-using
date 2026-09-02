import { apiRequest } from '../apiClient.js';

export type ImportKind = 'DEPARTMENTS' | 'MEMBERSHIPS';
export type ImportMode = 'CREATE_ONLY' | 'UPSERT';
export type ImportPreview = { valid: boolean; rowCount: number; errors: { row: number; field: string; message: string }[]; token?: string; expiresAt?: string };
export type OrgStructureEvent = { id: string; actorId: string | null; entityType: string; entityId: string | null; eventType: string; operationId: string; metadata: unknown; createdAt: string };

export function previewOrgStructureImport(file: File, kind: ImportKind, mode: ImportMode) {
  const form = new FormData(); form.append('file', file); form.append('kind', kind); form.append('mode', mode);
  return apiRequest<ImportPreview>('/org-structure/imports/preview', { method: 'POST', body: form });
}
export function commitOrgStructureImport(token: string) {
  return apiRequest<{ imported: number; operationId: string }>('/org-structure/imports/commit', { method: 'POST', body: JSON.stringify({ token }) });
}
export function listOrgStructureHistory(page = 1) {
  return apiRequest<{ items: OrgStructureEvent[]; total: number; page: number; pageSize: number }>(`/org-structure/history?page=${page}&pageSize=25`);
}

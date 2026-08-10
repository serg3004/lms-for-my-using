import { apiRequest, uploadChecklistItemPhotoWithProgress } from '../apiClient.js';

import type {
  ChecklistInstanceSummary,
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistSummary,
} from './types.js';

export function listChecklists() {
  return apiRequest<ChecklistSummary[]>('/checklists');
}

export function getChecklist(checklistId: string) {
  return apiRequest<ChecklistSummary>(`/checklists/${encodeURIComponent(checklistId)}`);
}

export function createChecklist(
  organizationId: string,
  input: {
    title: string;
    description?: string;
    scoringMode: string;
    passThreshold: number;
    scaleLevels?: unknown;
    requiresReview: boolean;
  },
) {
  return apiRequest<ChecklistSummary>('/checklists', {
    method: 'POST',
    body: JSON.stringify({ organizationId, ...input }),
  });
}

export function updateChecklist(checklistId: string, input: Record<string, unknown>) {
  return apiRequest<ChecklistSummary>(`/checklists/${encodeURIComponent(checklistId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteChecklist(checklistId: string) {
  return apiRequest<void>(`/checklists/${encodeURIComponent(checklistId)}`, { method: 'DELETE' });
}

export function createChecklistItem(
  checklistId: string,
  input: { text: string; points: number; isRequired: boolean; photoRequired: boolean },
) {
  return apiRequest<ChecklistItemSummary>(`/checklists/${encodeURIComponent(checklistId)}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateChecklistItem(itemId: string, input: Record<string, unknown>) {
  return apiRequest<ChecklistItemSummary>(`/checklist-items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteChecklistItem(itemId: string) {
  return apiRequest<void>(`/checklist-items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export function assignChecklist(checklistId: string, userId: string, dueAt?: string) {
  return apiRequest<ChecklistInstanceSummary>(`/checklists/${encodeURIComponent(checklistId)}/instances`, {
    method: 'POST',
    body: JSON.stringify({ userId, dueAt }),
  });
}

export function listInstancesForChecklist(checklistId: string) {
  return apiRequest<ChecklistInstanceSummary[]>(`/checklists/${encodeURIComponent(checklistId)}/instances`);
}

export function listMyChecklistInstances() {
  return apiRequest<ChecklistInstanceSummary[]>('/checklist-instances/mine');
}

export function listPendingChecklistReviews() {
  return apiRequest<ChecklistInstanceSummary[]>('/checklist-instances/pending-review');
}

export function getChecklistInstance(instanceId: string) {
  return apiRequest<ChecklistInstanceSummary>(`/checklist-instances/${encodeURIComponent(instanceId)}`);
}

export function submitChecklistItemResult(
  instanceId: string,
  itemId: string,
  input: { checked?: boolean; scaleLevel?: number; photoUrl?: string; comment?: string },
) {
  return apiRequest<ChecklistInstanceSummary>(
    `/checklist-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function uploadChecklistItemPhoto(instanceId: string, itemId: string, file: File) {
  return uploadChecklistItemPhotoWithProgress(instanceId, itemId, file, () => undefined) as Promise<ChecklistInstanceSummary>;
}

export function getChecklistItemPhotoUrl(instanceId: string, itemId: string) {
  return apiRequest<{ url: string; expiresIn: number }>(
    `/checklist-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/photo`,
  );
}

export function reviewChecklistItemResult(
  instanceId: string,
  itemId: string,
  input: { status: 'approved' | 'rejected'; comment?: string },
) {
  return apiRequest<ChecklistInstanceSummary>(
    `/checklist-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/review`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export type { ChecklistItemResultSummary };

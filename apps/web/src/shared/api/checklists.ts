import { apiRequest, uploadChecklistItemPhotoWithProgress } from '../apiClient.js';

import type {
  ChecklistAnalytics,
  ChecklistAnalyticsQuery,
  ChecklistInstanceEvent,
  ChecklistInstanceSummary,
  ChecklistItemGroup,
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistReviewQueueQuery,
  ChecklistScaleSummary,
  ChecklistSummary,
  ChecklistWorkplaceSettingsView,
  FreeChecklistSummary,
  PaginatedResponse,
} from './types.js';

function buildQueryString(params: Record<string, unknown>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))).toString()}` : '';
}

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

export function copyChecklist(checklistId: string) {
  return apiRequest<ChecklistSummary>(`/checklists/${encodeURIComponent(checklistId)}/copy`, { method: 'POST' });
}

export type ChecklistTemplateSummary = { key: string; title: string; description: string; groupCount: number; itemCount: number };

export function listChecklistTemplates(locale: string) {
  return apiRequest<{ items: ChecklistTemplateSummary[] }>(`/checklist-templates?locale=${encodeURIComponent(locale)}`);
}

export function createChecklistFromTemplate(templateKey: string, locale: string) {
  return apiRequest<ChecklistSummary>('/checklists/from-template', { method: 'POST', body: JSON.stringify({ templateKey, locale }) });
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

// ---- Item groups (PR 296 observation-sheet builder) ----

export function listChecklistItemGroups(checklistId: string) {
  return apiRequest<ChecklistItemGroup[]>(`/checklists/${encodeURIComponent(checklistId)}/groups`);
}

export function createChecklistItemGroup(checklistId: string, input: { title?: string } = {}) {
  return apiRequest<ChecklistItemGroup>(`/checklists/${encodeURIComponent(checklistId)}/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateChecklistItemGroup(groupId: string, input: { title?: string; order?: number }) {
  return apiRequest<ChecklistItemGroup>(`/checklist-item-groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function copyChecklistItemGroup(groupId: string) {
  return apiRequest<ChecklistItemGroup>(`/checklist-item-groups/${encodeURIComponent(groupId)}/copy`, { method: 'POST' });
}

// ---- Reusable evaluation scale library (PR 293) ----

export function listChecklistScales() {
  return apiRequest<ChecklistScaleSummary[]>('/checklist-scales');
}

export function createChecklistScale(input: { name: string; levels: { value: number; label: string; score: number }[] }) {
  return apiRequest<ChecklistScaleSummary>('/checklist-scales', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateChecklistScale(scaleId: string, input: { name?: string; levels?: { value: number; label: string; score: number }[] }) {
  return apiRequest<ChecklistScaleSummary>(`/checklist-scales/${encodeURIComponent(scaleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteChecklistScale(scaleId: string) {
  return apiRequest<void>(`/checklist-scales/${encodeURIComponent(scaleId)}`, { method: 'DELETE' });
}

export function copyChecklistScale(scaleId: string, name?: string) {
  return apiRequest<ChecklistScaleSummary>(`/checklist-scales/${encodeURIComponent(scaleId)}/copy`, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  });
}

export function archiveChecklistScale(scaleId: string) {
  return apiRequest<ChecklistScaleSummary>(`/checklist-scales/${encodeURIComponent(scaleId)}/archive`, { method: 'POST' });
}

export function assignChecklist(checklistId: string, userId: string, dueAt?: string) {
  return apiRequest<ChecklistInstanceSummary>(`/checklists/${encodeURIComponent(checklistId)}/instances`, {
    method: 'POST',
    body: JSON.stringify({ userId, dueAt }),
  });
}

export type BulkChecklistTarget =
  | { type: 'user'; id: string }
  | { type: 'group'; id: string }
  | { type: 'manager_team' };

export type BulkChecklistAssignmentResult = {
  created: number;
  skippedActive: number;
  resolvedRecipients: number;
  recipientCount: number;
};

export function bulkAssignChecklist(checklistId: string, targets: BulkChecklistTarget[], dueAt?: string) {
  return apiRequest<BulkChecklistAssignmentResult>(`/checklists/${encodeURIComponent(checklistId)}/instances/bulk`, {
    method: 'POST',
    body: JSON.stringify({ targets, dueAt }),
  });
}

export function listInstancesForChecklist(checklistId: string) {
  return apiRequest<ChecklistInstanceSummary[]>(`/checklists/${encodeURIComponent(checklistId)}/instances`);
}

export function listFreeChecklists() {
  return apiRequest<FreeChecklistSummary[]>('/checklists/free');
}

export function startFreeChecklist(checklistId: string) {
  return apiRequest<ChecklistInstanceSummary>(`/checklists/${encodeURIComponent(checklistId)}/start`, { method: 'POST' });
}

export function listMyChecklistInstances() {
  return apiRequest<ChecklistInstanceSummary[]>('/checklist-instances/mine');
}

export function searchChecklistReviewQueue(query: ChecklistReviewQueueQuery = {}) {
  return apiRequest<PaginatedResponse<ChecklistInstanceSummary>>(`/checklist-instances/review-queue${buildQueryString(query)}`);
}

export function assignChecklistReviewer(instanceId: string, reviewerId: string | null) {
  return apiRequest<ChecklistInstanceSummary>(`/checklist-instances/${encodeURIComponent(instanceId)}/reviewer`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewerId }),
  });
}

export function listChecklistInstanceEvents(instanceId: string) {
  return apiRequest<ChecklistInstanceEvent[]>(`/checklist-instances/${encodeURIComponent(instanceId)}/events`);
}

export function getChecklistAnalytics(query: ChecklistAnalyticsQuery = {}) {
  return apiRequest<ChecklistAnalytics>(`/checklists/analytics${buildQueryString(query)}`);
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

export function skipChecklistItem(instanceId: string, itemId: string, input: { comment?: string } = {}) {
  return apiRequest<ChecklistInstanceSummary>(
    `/checklist-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/skip`,
    { method: 'POST', body: JSON.stringify(input) },
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

// ---- Workplace-training module settings (PR 286) ----

export function getChecklistWorkplaceSettings() {
  return apiRequest<ChecklistWorkplaceSettingsView>('/checklists/workplace-settings');
}

export function updateChecklistWorkplaceSettings(input: {
  moduleEnabled?: boolean;
  highPerformanceThreshold?: number;
  lowThreshold?: number | null;
  defaultGeolocationPolicy?: ChecklistWorkplaceSettingsView['defaultGeolocationPolicy'];
  feedbackVisibility?: ChecklistWorkplaceSettingsView['feedbackVisibility'];
  observerEligibility?: ChecklistWorkplaceSettingsView['observerEligibility'];
  observerRoles?: ChecklistWorkplaceSettingsView['observerRoles'];
  observerUserIds?: string[];
}) {
  return apiRequest<ChecklistWorkplaceSettingsView>('/checklists/workplace-settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type { ChecklistItemResultSummary };

// PR 355: checklist cover image. The server keeps the file private and hands out a short-lived URL.
export function uploadChecklistCover(checklistId: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return apiRequest<{ id: string; coverUpdatedAt: string | null }>(`/checklists/${encodeURIComponent(checklistId)}/cover`, { method: 'POST', body });
}

export function deleteChecklistCover(checklistId: string) {
  return apiRequest<{ id: string; coverUpdatedAt: string | null }>(`/checklists/${encodeURIComponent(checklistId)}/cover`, { method: 'DELETE' });
}

export function getChecklistCoverUrl(checklistId: string) {
  return apiRequest<{ url: string; expiresIn: number }>(`/checklists/${encodeURIComponent(checklistId)}/cover`);
}

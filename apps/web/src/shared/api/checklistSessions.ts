import { apiRequest } from '../apiClient.js';

import type {
  BulkCreateChecklistSessionInput,
  BulkCreateChecklistSessionResult,
  ChecklistSession,
  ChecklistSessionAction,
  ChecklistSessionParticipant,
  ChecklistSessionParticipantsQuery,
  ChecklistSessionQuery,
  ChecklistSessionSummary,
  ChecklistSummary,
  CreateChecklistSessionInput,
  PaginatedResponse,
  UpdateChecklistSessionInput,
} from './types.js';

function buildQueryString(params: Record<string, unknown>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))).toString()}` : '';
}

export function listChecklistSessions(query: ChecklistSessionQuery = {}) {
  return apiRequest<PaginatedResponse<ChecklistSessionSummary>>(`/checklist-sessions${buildQueryString(query)}`);
}

export function getChecklistSession(sessionId: string) {
  return apiRequest<ChecklistSessionSummary>(`/checklist-sessions/${encodeURIComponent(sessionId)}`);
}

export function createChecklistSession(input: CreateChecklistSessionInput) {
  return apiRequest<ChecklistSession>('/checklist-sessions', { method: 'POST', body: JSON.stringify(input) });
}

export function bulkCreateChecklistSessions(input: BulkCreateChecklistSessionInput) {
  return apiRequest<BulkCreateChecklistSessionResult>('/checklist-sessions/bulk', { method: 'POST', body: JSON.stringify(input) });
}

export function updateChecklistSession(sessionId: string, input: UpdateChecklistSessionInput) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function transitionChecklistSession(sessionId: string, action: ChecklistSessionAction, version: number) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export function repeatChecklistSession(sessionId: string) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/repeat`, { method: 'POST' });
}

export function listChecklistSessionParticipants(query: ChecklistSessionParticipantsQuery) {
  return apiRequest<PaginatedResponse<ChecklistSessionParticipant>>(`/checklist-sessions/participants${buildQueryString(query)}`);
}

/** Wizard's checklist picker -- published-only, so a draft/archived checklist can't be selected. */
export function listPublishedChecklists() {
  return apiRequest<ChecklistSummary[]>(`/checklists${buildQueryString({ status: 'published' })}`);
}

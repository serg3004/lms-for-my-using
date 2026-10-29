import { apiRequest } from '../apiClient.js';

import type {
  BulkCreateChecklistSessionInput,
  BulkCreateChecklistSessionResult,
  ChecklistLocationCapture,
  ChecklistLocationCapturePoint,
  ChecklistScoreRevision,
  ChecklistSession,
  ChecklistSessionReport,
  ChecklistSessionSummaryExport,
  ChecklistSessionAction,
  ChecklistSessionEvent,
  ChecklistSessionParticipant,
  ChecklistSessionParticipantsQuery,
  ChecklistSessionQuery,
  ChecklistSessionSummary,
  ChecklistSummary,
  CreateChecklistSessionInput,
  MarkChecklistSessionObserverUnavailableInput,
  PaginatedResponse,
  RecalculateChecklistScoreInput,
  RecalculateChecklistScoreResult,
  SubmitChecklistLocationCaptureInput,
  SubmitChecklistSessionFeedbackInput,
  SubmitChecklistSessionContextInput,
  UpdateChecklistSessionInput,
} from './types.js';

function buildQueryString(params: Record<string, unknown>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))).toString()}` : '';
}

export function listChecklistSessions(query: ChecklistSessionQuery = {}) {
  return apiRequest<PaginatedResponse<ChecklistSessionSummary>>(`/checklist-sessions${buildQueryString(query)}`);
}

export function listOwnChecklistSessions(query: ChecklistSessionQuery = {}) {
  return apiRequest<PaginatedResponse<ChecklistSessionSummary>>(`/checklist-sessions/to-conduct${buildQueryString(query)}`);
}

export function getConductChecklistSession(sessionId: string) {
  return apiRequest<ChecklistSessionSummary>(`/checklist-sessions/${encodeURIComponent(sessionId)}/conduct`);
}

export type ChecklistReportExport = { filename: string; csv: string; rows: (string | number)[][]; rowCount: number };
export type ChecklistReportFormat = 'csv' | 'xlsx';

/** PR 336: the same filters as the list, minus paging; the server builds, scopes and audits the file. */
export function exportChecklistSessions(query: Omit<ChecklistSessionQuery, 'page' | 'pageSize'> & { format?: ChecklistReportFormat } = {}) {
  return apiRequest<ChecklistReportExport>(`/checklist-sessions/export${buildQueryString(query)}`);
}

export function getChecklistSession(sessionId: string) {
  return apiRequest<ChecklistSessionSummary>(`/checklist-sessions/${encodeURIComponent(sessionId)}`);
}

/** PR 371: the one server-built report behind the summary and criteria tabs. */
export function getChecklistSessionReport(sessionId: string) {
  return apiRequest<ChecklistSessionReport>(`/checklist-sessions/${encodeURIComponent(sessionId)}/report`);
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

/** PR 333: soft delete of a session that has not started. */
export function deleteChecklistSession(sessionId: string) {
  return apiRequest<{ deleted: true }>(`/checklist-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

/** PR 333: in-app message (plus best-effort email) to the session's participant. */
export function sendChecklistSessionMessage(sessionId: string, message: string) {
  return apiRequest<{ sent: true }>(`/checklist-sessions/${encodeURIComponent(sessionId)}/message`, { method: 'POST', body: JSON.stringify({ message }) });
}

export function transitionChecklistSession(sessionId: string, action: ChecklistSessionAction, version: number, idempotencyKey?: string) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(idempotencyKey ? { version, idempotencyKey } : { version }),
  });
}

export function repeatChecklistSession(sessionId: string) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/repeat`, { method: 'POST' });
}

export function listChecklistSessionEvents(sessionId: string) {
  return apiRequest<ChecklistSessionEvent[]>(`/checklist-sessions/${encodeURIComponent(sessionId)}/events`);
}

export function submitChecklistSessionFeedback(sessionId: string, input: SubmitChecklistSessionFeedbackInput) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/feedback`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function submitChecklistSessionContext(sessionId: string, input: SubmitChecklistSessionContextInput) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/context`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function captureChecklistSessionLocation(
  sessionId: string,
  point: ChecklistLocationCapturePoint,
  input: SubmitChecklistLocationCaptureInput,
) {
  return apiRequest<ChecklistLocationCapture>(
    `/checklist-sessions/${encodeURIComponent(sessionId)}/location/${encodeURIComponent(point)}`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function listChecklistSessionLocationCaptures(sessionId: string) {
  return apiRequest<ChecklistLocationCapture[]>(`/checklist-sessions/${encodeURIComponent(sessionId)}/location`);
}

export function listChecklistSessionParticipants(query: ChecklistSessionParticipantsQuery) {
  return apiRequest<PaginatedResponse<ChecklistSessionParticipant>>(`/checklist-sessions/participants${buildQueryString(query)}`);
}

/** Wizard's checklist picker -- published-only, so a draft/archived checklist can't be selected. */
export function listPublishedChecklists() {
  return apiRequest<ChecklistSummary[]>(`/checklists${buildQueryString({ status: 'published' })}`);
}

// ---- PR 300: admin session report — auditable recalculate ----

export function listChecklistScoreRevisions(sessionId: string) {
  return apiRequest<ChecklistScoreRevision[]>(`/checklist-sessions/${encodeURIComponent(sessionId)}/score-revisions`);
}

export function recalculateChecklistSessionScore(sessionId: string, input: RecalculateChecklistScoreInput) {
  return apiRequest<RecalculateChecklistScoreResult>(`/checklist-sessions/${encodeURIComponent(sessionId)}/recalculate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---- PR 302: observer unavailable ----

export function markChecklistSessionObserverUnavailable(sessionId: string, input: MarkChecklistSessionObserverUnavailableInput) {
  return apiRequest<ChecklistSession>(`/checklist-sessions/${encodeURIComponent(sessionId)}/observer-unavailable`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}


export type SessionImportRow = {
  row: number; email: string; status: 'ready' | 'skipped' | 'created';
  reason?: 'invalid_email' | 'duplicate' | 'outside_scope' | 'self_observer' | 'active_assignment' | 'scope_changed';
  employee?: { id: string; firstName: string; lastName: string; email: string }; sessionId?: string;
};
export type SessionImportPreview = { ready: number; skipped: number; rows: SessionImportRow[] };
export type SessionImportResult = BulkCreateChecklistSessionResult & { rows: SessionImportRow[] };
export function previewChecklistSessionImport(file: File) {
  const body = new FormData(); body.append('file', file);
  return apiRequest<SessionImportPreview>('/checklist-sessions/import/preview', { method: 'POST', body });
}
export function importChecklistSessions(file: File, settings: Omit<BulkCreateChecklistSessionInput, 'learnerIds' | 'schedules'> & { operationId: string }) {
  const body = new FormData(); body.append('file', file); body.append('settings', JSON.stringify(settings));
  return apiRequest<SessionImportResult>('/checklist-sessions/import', { method: 'POST', body });
}

/** The API validates the complete selection; the browser never builds totals from raw sessions. */
export function exportChecklistSessionSummary(ids: string[], format: ChecklistReportFormat = 'xlsx') {
  return apiRequest<ChecklistSessionSummaryExport>(`/checklist-sessions/export/summary${buildQueryString({ ids: ids.join(','), format })}`);
}

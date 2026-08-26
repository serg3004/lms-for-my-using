import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse } from './types.js';

const auditLogPath = '/audit-log';

export type AuditLogActor = { id: string; firstName: string; lastName: string; email: string } | null;

export type AuditLogEntry = {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: AuditLogActor;
};

export type AuditLogQuery = {
  page?: number;
  pageSize?: number;
  action?: string;
  targetType?: string;
  actorId?: string;
};

export type AuditLogFilterOptions = {
  actions: string[];
  targetTypes: string[];
};

export function listAuditLog(params?: AuditLogQuery) {
  const entries = Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== '');
  const qs = entries.length ? `?${new URLSearchParams(Object.fromEntries(entries.map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<AuditLogEntry>>(`${auditLogPath}${qs}`);
}

export function getAuditLogFilterOptions() {
  return apiRequest<AuditLogFilterOptions>(`${auditLogPath}/filter-options`);
}

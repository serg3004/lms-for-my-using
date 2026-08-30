import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse } from './types.js';

export type PositionStatus = 'active' | 'archived';

export type Position = {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string | null;
  status: PositionStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePositionPayload = { organizationId: string; code: string; title: string; description?: string };
export type UpdatePositionPayload = Partial<{ code: string; title: string; description: string | null }>;

function listQuery(params: { page?: number; pageSize?: number; search?: string; status?: PositionStatus }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return qs ? `?${qs}` : '';
}

export function listPositions(params: { page?: number; pageSize?: number; search?: string; status?: PositionStatus } = {}) {
  return apiRequest<PaginatedResponse<Position>>(`/positions${listQuery(params)}`);
}

export function getPosition(id: string) {
  return apiRequest<Position>(`/positions/${encodeURIComponent(id)}`);
}

export function createPosition(payload: CreatePositionPayload) {
  return apiRequest<Position>('/positions', { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePosition(id: string, payload: UpdatePositionPayload) {
  return apiRequest<Position>(`/positions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function archivePosition(id: string) {
  return apiRequest<Position>(`/positions/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export function restorePosition(id: string) {
  return apiRequest<Position>(`/positions/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

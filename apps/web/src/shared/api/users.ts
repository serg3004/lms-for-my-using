import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse, UserSummary } from './types.js';

export function listUsers(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const qs = params
    ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()}`
    : '';
  return apiRequest<PaginatedResponse<UserSummary>>(`/users${qs}`);
}

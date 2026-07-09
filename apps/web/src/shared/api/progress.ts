import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse, ProgressSummary } from './types.js';

const progressPath = '/progress';

export function listProgress(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<ProgressSummary>>(`${progressPath}${qs}`);
}

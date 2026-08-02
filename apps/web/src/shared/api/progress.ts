import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse, ProgressSummary, ProgressSummaryReport } from './types.js';

const progressPath = '/progress';

export function listProgress(params?: { page?: number; pageSize?: number }) {
  const qs = params ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()}` : '';
  return apiRequest<PaginatedResponse<ProgressSummary>>(`${progressPath}${qs}`);
}

export function getProgressSummary(period: 30 | 90 | 365) {
  return apiRequest<ProgressSummaryReport>(`${progressPath}/summary?period=${period}`);
}

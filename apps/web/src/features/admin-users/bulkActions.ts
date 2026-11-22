import { apiRequest } from '../../shared/apiClient.js';
import type { PaginatedResponse } from '../../shared/api/types.js';

/** PR 497: bulk actions over users: the same shapes as `POST /users/bulk-actions`. */
export type BulkActionName = 'suspend' | 'activate' | 'archive' | 'move' | 'resend';
export type BulkFilter = { search?: string; status?: string };
export type BulkTarget = { userIds: string[] } | { filter: BulkFilter };
export type BulkItemStatus = 'done' | 'unchanged' | 'notFound' | 'forbidden' | 'conflict' | 'rateLimited' | 'failed';
export type BulkItem = { userId: string; status: BulkItemStatus; reason?: string };
export type BulkReport = { action: BulkActionName; summary: { requested: number; done: number; unchanged: number; failed: number }; items: BulkItem[] };
export type BulkImpact = { users: number; observerSessions: number; soleInstructorCourses: number; openAssignments: number; subordinates: number; managedDepartments: number };

export function runBulkAction(action: BulkActionName, target: BulkTarget, extra: { departmentId?: string; confirm?: boolean } = {}) {
  return apiRequest<BulkReport>('/users/bulk-actions', { method: 'POST', body: JSON.stringify({ action, ...target, ...extra }) });
}

export function loadBulkImpact(target: BulkTarget) {
  return apiRequest<BulkImpact>('/users/bulk-actions/impact', { method: 'POST', body: JSON.stringify(target) });
}

/** How many users a list filter matches (the "select everyone matching the filter" count). */
export async function countMatching(filter: BulkFilter): Promise<number> {
  const query = new URLSearchParams({ page: '1', pageSize: '1' });
  if (filter.search) query.set('search', filter.search);
  if (filter.status) query.set('status', filter.status);
  return (await apiRequest<PaginatedResponse<unknown>>(`/users?${query.toString()}`)).total;
}

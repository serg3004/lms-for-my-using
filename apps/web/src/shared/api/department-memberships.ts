import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse } from './types.js';

export type DepartmentMembershipUser = { id: string; firstName: string; lastName: string | null; email: string; status: string };
export type DepartmentMembershipDepartment = { id: string; name: string; status: string };

export type DepartmentMembership = {
  id: string;
  organizationId: string;
  departmentId: string;
  userId: string;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentUserRow = DepartmentMembership & { user: DepartmentMembershipUser };
export type UserMembershipRow = DepartmentMembership & { department: DepartmentMembershipDepartment };

export type CreateDepartmentMembershipPayload = {
  organizationId: string;
  departmentId: string;
  userId: string;
  isPrimary?: boolean;
};

function paginationQuery(params: { page?: number; pageSize?: number; search?: string }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return qs ? `?${qs}` : '';
}

export function listDepartmentUsers(departmentId: string, params: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiRequest<PaginatedResponse<DepartmentUserRow>>(
    `/departments/${encodeURIComponent(departmentId)}/users${paginationQuery(params)}`,
  );
}

export function listUserDepartmentMemberships(userId: string) {
  return apiRequest<UserMembershipRow[]>(`/users/${encodeURIComponent(userId)}/department-memberships`);
}

export function createDepartmentMembership(payload: CreateDepartmentMembershipPayload) {
  return apiRequest<DepartmentMembership>('/department-memberships', { method: 'POST', body: JSON.stringify(payload) });
}

export function closeDepartmentMembership(id: string) {
  return apiRequest<DepartmentMembership>(`/department-memberships/${encodeURIComponent(id)}/close`, { method: 'POST' });
}

export function transferUserDepartment(userId: string, departmentId: string) {
  return apiRequest<DepartmentMembership>(`/users/${encodeURIComponent(userId)}/department-transfer`, {
    method: 'POST',
    body: JSON.stringify({ departmentId }),
  });
}

export function bulkTransferDepartmentUsers(departmentId: string, userIds: string[]) {
  return apiRequest<DepartmentMembership[]>(`/departments/${encodeURIComponent(departmentId)}/users/bulk-transfer`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

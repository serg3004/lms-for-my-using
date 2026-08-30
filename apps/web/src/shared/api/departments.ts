import { apiRequest } from '../apiClient.js';

import type { PaginatedResponse } from './types.js';

export type DepartmentStatus = 'active' | 'archived';
export type DepartmentManagerMode = 'LOCAL' | 'INHERIT' | 'MERGE';

export type Department = {
  id: string;
  organizationId: string;
  parentId: string | null;
  departmentTypeId: string | null;
  name: string;
  code: string | null;
  description: string | null;
  sortOrder: number;
  status: DepartmentStatus;
  directManagerMode: DepartmentManagerMode;
  functionalManagerMode: DepartmentManagerMode;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { children: number };
  /** Current, active, primary memberships directly in this department (PR 274). */
  directUserCount: number;
  /** Unique users with a current, active, primary membership in this department or any descendant (PR 274). */
  subtreeUserCount: number;
};

export type DepartmentType = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateDepartmentPayload = {
  organizationId: string;
  parentId?: string;
  departmentTypeId?: string;
  name: string;
  code?: string;
  description?: string;
  sortOrder?: number;
  directManagerMode?: DepartmentManagerMode;
  functionalManagerMode?: DepartmentManagerMode;
};

export type UpdateDepartmentPayload = Partial<{
  name: string;
  departmentTypeId: string | null;
  code: string | null;
  description: string | null;
  sortOrder: number;
}>;

export type CreateDepartmentTypePayload = { organizationId: string; code: string; name: string; sortOrder?: number };
export type UpdateDepartmentTypePayload = Partial<{ code: string; name: string; sortOrder: number }>;

function statusQuery(status?: DepartmentStatus) {
  return status ? `?status=${encodeURIComponent(status)}` : '';
}

export function getDepartmentTree(status?: DepartmentStatus) {
  return apiRequest<Department[]>(`/departments/tree${statusQuery(status)}`);
}

export function listDepartments(params: { page?: number; pageSize?: number; search?: string; departmentTypeId?: string; status?: DepartmentStatus }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString();
  return apiRequest<PaginatedResponse<Department>>(`/departments${qs ? `?${qs}` : ''}`);
}

export function getDepartment(id: string) {
  return apiRequest<Department>(`/departments/${encodeURIComponent(id)}`);
}

export function getDepartmentChildren(id: string, status?: DepartmentStatus) {
  return apiRequest<Department[]>(`/departments/${encodeURIComponent(id)}/children${statusQuery(status)}`);
}

export function getDepartmentPath(id: string) {
  return apiRequest<Department[]>(`/departments/${encodeURIComponent(id)}/path`);
}

export function createDepartment(payload: CreateDepartmentPayload) {
  return apiRequest<Department>('/departments', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateDepartment(id: string, payload: UpdateDepartmentPayload) {
  return apiRequest<Department>(`/departments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function moveDepartment(id: string, parentId: string | null) {
  return apiRequest<Department>(`/departments/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: JSON.stringify({ parentId }),
  });
}

export function archiveDepartment(id: string) {
  return apiRequest<Department>(`/departments/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export function restoreDepartment(id: string) {
  return apiRequest<Department>(`/departments/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

export function listDepartmentTypes() {
  return apiRequest<DepartmentType[]>('/department-types');
}

export function createDepartmentType(payload: CreateDepartmentTypePayload) {
  return apiRequest<DepartmentType>('/department-types', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateDepartmentType(id: string, payload: UpdateDepartmentTypePayload) {
  return apiRequest<DepartmentType>(`/department-types/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function archiveDepartmentType(id: string) {
  return apiRequest<DepartmentType>(`/department-types/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export function restoreDepartmentType(id: string) {
  return apiRequest<DepartmentType>(`/department-types/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

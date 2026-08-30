import { apiRequest } from '../apiClient.js';

export type DepartmentManagerType = 'DIRECT' | 'FUNCTIONAL';

export type DepartmentManagerUser = { id: string; firstName: string; lastName: string | null; email: string; status: string };

/** A department's computed effective manager set (LOCAL/INHERIT/MERGE already resolved server-side). */
export type EffectiveDepartmentManager = {
  id: string;
  type: DepartmentManagerType;
  userId: string;
  isPrimary: boolean;
  source: 'LOCAL' | 'INHERITED';
  sourceDepartmentId: string;
  effectiveFrom: string;
  user: DepartmentManagerUser | null;
};

export type DepartmentManager = {
  id: string;
  organizationId: string;
  departmentId: string;
  userId: string;
  type: DepartmentManagerType;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDepartmentManagerPayload = {
  organizationId: string;
  departmentId: string;
  userId: string;
  type: DepartmentManagerType;
  isPrimary?: boolean;
};

export type UpdateManagerModesPayload = Partial<{
  directManagerMode: 'LOCAL' | 'INHERIT' | 'MERGE';
  functionalManagerMode: 'LOCAL' | 'INHERIT' | 'MERGE';
}>;

export function getEffectiveDepartmentManagers(departmentId: string) {
  return apiRequest<EffectiveDepartmentManager[]>(`/departments/${encodeURIComponent(departmentId)}/managers`);
}

export function createDepartmentManager(payload: CreateDepartmentManagerPayload) {
  return apiRequest<DepartmentManager>('/department-managers', { method: 'POST', body: JSON.stringify(payload) });
}

export function closeDepartmentManager(id: string) {
  return apiRequest<DepartmentManager>(`/department-managers/${encodeURIComponent(id)}/close`, { method: 'POST' });
}

export function updateDepartmentManagerModes(departmentId: string, payload: UpdateManagerModesPayload) {
  return apiRequest<{ id: string; organizationId: string; directManagerMode: string; functionalManagerMode: string }>(
    `/departments/${encodeURIComponent(departmentId)}/manager-modes`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

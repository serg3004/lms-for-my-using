import type { PermissionScope } from '@lms/shared/permission-catalog';

import { apiRequest } from '../apiClient.js';

/** PR 485: client of the custom roles API (PR 484). The server decides; this only carries the requests. */

export type RoleGrant = { action: string; scope: PermissionScope };
export type CustomRole = {
  id: string;
  name: string;
  description: string | null;
  state: 'active' | 'archived';
  version: number;
  permissions: RoleGrant[];
  /** Only in the list. */
  userCount?: number;
};
export type RoleAssignment = { userId: string; assignedAt: string; email: string; firstName: string; lastName: string };
export type EffectivePermissionsView = {
  customRolesEnabled: boolean;
  customRoles: Array<{ id: string; name: string }>;
  permissions: Array<{ action: string; builtIn: boolean; scopes: PermissionScope[] }>;
};

const base = '/custom-roles';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const listCustomRoles = () => apiRequest<CustomRole[]>(base);
export const createCustomRole = (input: { name: string; description?: string | null; permissions?: RoleGrant[]; basedOnRoleId?: string }) =>
  apiRequest<CustomRole>(base, json('POST', input));
export const updateCustomRole = (id: string, input: { version: number; name?: string; description?: string | null; permissions?: RoleGrant[] }) =>
  apiRequest<CustomRole>(`${base}/${encodeURIComponent(id)}`, json('PATCH', input));
export const archiveCustomRole = (id: string, version: number) =>
  apiRequest<CustomRole>(`${base}/${encodeURIComponent(id)}/archive`, json('POST', { version }));
export const listRoleAssignments = (id: string) => apiRequest<RoleAssignment[]>(`${base}/${encodeURIComponent(id)}/assignments`);
export const assignCustomRole = (id: string, userId: string) =>
  apiRequest<unknown>(`${base}/${encodeURIComponent(id)}/assignments/${encodeURIComponent(userId)}`, { method: 'PUT' });
export const revokeCustomRole = (id: string, userId: string) =>
  apiRequest<unknown>(`${base}/${encodeURIComponent(id)}/assignments/${encodeURIComponent(userId)}`, { method: 'DELETE' });
export const getUserPermissions = (userId: string) => apiRequest<EffectivePermissionsView>(`${base}/users/${encodeURIComponent(userId)}/permissions`);
export const getMyPermissions = () => apiRequest<EffectivePermissionsView>('/me/permissions');

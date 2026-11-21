import { apiRequest } from '../apiClient.js';

import type { OrganizationSummary } from './types.js';

export function getOrganization(organizationId: string) {
  return apiRequest<OrganizationSummary>(`/organizations/${encodeURIComponent(organizationId)}`);
}

export type OrganizationFeatures = { longreadEnabled: boolean; customRolesEnabled?: boolean };

export function getOrganizationFeatures(organizationId: string) {
  return apiRequest<OrganizationFeatures>(`/organizations/${encodeURIComponent(organizationId)}/features`);
}

export function saveOrganizationFeatures(organizationId: string, features: OrganizationFeatures) {
  return apiRequest<OrganizationFeatures>(`/organizations/${encodeURIComponent(organizationId)}/features`, {
    method: 'PATCH',
    body: JSON.stringify(features),
  });
}

export type OrganizationPasswordPolicy = { minLength: number; historyCount: number };

export function getPasswordPolicy(organizationId: string) {
  return apiRequest<OrganizationPasswordPolicy>(`/organizations/${encodeURIComponent(organizationId)}/password-policy`);
}

export function savePasswordPolicy(organizationId: string, policy: OrganizationPasswordPolicy) {
  return apiRequest<OrganizationPasswordPolicy>(`/organizations/${encodeURIComponent(organizationId)}/password-policy`, {
    method: 'PATCH',
    body: JSON.stringify(policy),
  });
}

/** PR 493: sign-in protection thresholds and the accounts it has locked. */
export type LoginProtection = { maxFailures: number; windowMinutes: number; lockMinutes: number };
export type LockedUser = { id: string; email: string; firstName: string; lastName: string; middleName: string | null; loginLockedUntil: string };

export function getLoginProtection(organizationId: string) {
  return apiRequest<LoginProtection>(`/organizations/${encodeURIComponent(organizationId)}/login-protection`);
}

export function saveLoginProtection(organizationId: string, settings: LoginProtection) {
  return apiRequest<LoginProtection>(`/organizations/${encodeURIComponent(organizationId)}/login-protection`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function listLockedUsers() {
  return apiRequest<LockedUser[]>('/users/locked');
}

export function unlockUser(userId: string) {
  return apiRequest<{ unlocked: boolean }>(`/users/${encodeURIComponent(userId)}/unlock`, { method: 'POST', body: JSON.stringify({}) });
}

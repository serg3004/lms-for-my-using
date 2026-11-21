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

import { apiRequest } from '../apiClient.js';

import type { OrganizationSummary } from './types.js';

export function getOrganization(organizationId: string) {
  return apiRequest<OrganizationSummary>(`/organizations/${encodeURIComponent(organizationId)}`);
}

export type OrganizationFeatures = { longreadEnabled: boolean };

export function getOrganizationFeatures(organizationId: string) {
  return apiRequest<OrganizationFeatures>(`/organizations/${encodeURIComponent(organizationId)}/features`);
}

export function saveOrganizationFeatures(organizationId: string, features: OrganizationFeatures) {
  return apiRequest<OrganizationFeatures>(`/organizations/${encodeURIComponent(organizationId)}/features`, {
    method: 'PATCH',
    body: JSON.stringify(features),
  });
}

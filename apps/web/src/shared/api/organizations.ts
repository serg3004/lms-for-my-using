import { apiRequest } from '../apiClient.js';

import type { OrganizationSummary } from './types.js';

export function getOrganization(organizationId: string) {
  return apiRequest<OrganizationSummary>(`/organizations/${encodeURIComponent(organizationId)}`);
}

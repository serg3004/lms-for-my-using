import { apiRequest } from '../apiClient.js';

import type { MembershipSummary } from './types.js';

export function listMemberships() {
  return apiRequest<MembershipSummary[]>('/memberships');
}

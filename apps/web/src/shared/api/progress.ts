import { apiRequest } from '../apiClient.js';

import type { ProgressSummary } from './types.js';

const progressPath = '/progress';

export function listProgress() {
  return apiRequest<ProgressSummary[]>(progressPath);
}

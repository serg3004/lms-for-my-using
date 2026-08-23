import type { ChecklistItemResultSummary } from '../shared/api/types.js';

export function hasChecklistPhotoEvidence(result: ChecklistItemResultSummary | null | undefined) {
  return Boolean(result?.photoFileName);
}

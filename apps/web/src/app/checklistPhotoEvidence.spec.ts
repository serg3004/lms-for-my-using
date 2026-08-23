import { describe, expect, it } from 'vitest';

import type { ChecklistItemResultSummary } from '../shared/api/types.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';

function result(overrides: Partial<ChecklistItemResultSummary> = {}): ChecklistItemResultSummary {
  return {
    id: 'result-1',
    itemId: 'item-1',
    checked: true,
    scaleLevel: null,
    points: 10,
    photoUrl: null,
    photoFileName: null,
    comment: null,
    reviewStatus: 'pending',
    reviewComment: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

describe('hasChecklistPhotoEvidence', () => {
  it('detects object-backed evidence even when legacy photoUrl is null', () => {
    expect(hasChecklistPhotoEvidence(result({ photoFileName: 'evidence.jpg', photoUrl: null }))).toBe(true);
  });

  it('does not treat legacy photoUrl alone as canonical evidence', () => {
    expect(hasChecklistPhotoEvidence(result({ photoFileName: null, photoUrl: 'https://legacy.example/photo.jpg' }))).toBe(false);
  });

  it('reports missing evidence when storage-backed metadata is absent', () => {
    expect(hasChecklistPhotoEvidence(result())).toBe(false);
  });
});

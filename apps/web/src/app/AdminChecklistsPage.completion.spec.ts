import { describe, expect, it } from 'vitest';

import type { ChecklistItemSummary } from '../shared/api/types.js';
import { computePreviewResult } from './AdminChecklistsPage.js';

const requiredPhoto: ChecklistItemSummary = {
  id: 'required-photo',
  checklistId: 'checklist-1',
  order: 0,
  text: 'Required evidence',
  points: 10,
  isRequired: true,
  photoRequired: true,
};
const optional: ChecklistItemSummary = {
  id: 'optional',
  checklistId: 'checklist-1',
  order: 1,
  text: 'Optional detail',
  points: 5,
  isRequired: false,
  photoRequired: false,
};

describe('checklist preview completion', () => {
  it('keeps scoring unchanged while requiring photo evidence for completion', () => {
    const withoutPhoto = computePreviewResult(
      [requiredPhoto, optional],
      'sum_points',
      [],
      60,
      { 'required-photo': { checked: true, hasPhoto: false } },
    );

    expect(withoutPhoto).toEqual({ totalScore: 10, maxScore: 15, percentage: 67, passed: false, allAnswered: false });

    const withPhoto = computePreviewResult(
      [requiredPhoto, optional],
      'sum_points',
      [],
      60,
      { 'required-photo': { checked: true, hasPhoto: true } },
    );

    expect(withPhoto).toEqual({ totalScore: 10, maxScore: 15, percentage: 67, passed: true, allAnswered: true });
  });

  it('allows optional items to be skipped, but an answered optional photo item needs evidence', () => {
    const optionalPhoto = { ...optional, id: 'optional-photo', photoRequired: true };

    expect(computePreviewResult([optionalPhoto], 'all_required', [], 0, {}).allAnswered).toBe(true);
    expect(computePreviewResult([optionalPhoto], 'all_required', [], 0, {
      'optional-photo': { checked: true, hasPhoto: false },
    }).allAnswered).toBe(false);
    expect(computePreviewResult([optionalPhoto], 'all_required', [], 0, {
      'optional-photo': { checked: true, hasPhoto: true },
    }).allAnswered).toBe(true);
  });
});

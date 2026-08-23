import { describe, expect, it } from 'vitest';

import type { ChecklistItemSummary, ChecklistScoringMode } from '../shared/api/types.js';
import {
  getRequiredChecklistProgress,
  hasChecklistAnswer,
  isChecklistAnswerComplete,
  isChecklistRequirementSatisfied,
} from './checklistCompletion.js';

const item = (overrides: Partial<ChecklistItemSummary> = {}): ChecklistItemSummary => ({
  id: 'item-1',
  checklistId: 'checklist-1',
  order: 0,
  text: 'Check the equipment',
  points: 10,
  isRequired: true,
  photoRequired: false,
  ...overrides,
});

const result = (overrides: Record<string, unknown> = {}) => ({
  id: 'result-1',
  itemId: 'item-1',
  checked: true,
  scaleLevel: null,
  points: 10,
  photoUrl: null,
  photoFileName: null,
  comment: null,
  reviewStatus: 'pending' as const,
  reviewComment: null,
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
});

describe('checklist completion helpers', () => {
  it.each<ChecklistScoringMode>(['sum_points', 'all_required'])('requires checked=true for %s answers', (mode) => {
    expect(hasChecklistAnswer(mode, { checked: false })).toBe(false);
    expect(hasChecklistAnswer(mode, { checked: true })).toBe(true);
  });

  it('requires a selected scale level for scale answers', () => {
    expect(hasChecklistAnswer('scale', { scaleLevel: null })).toBe(false);
    expect(hasChecklistAnswer('scale', { scaleLevel: 0 })).toBe(true);
  });

  it('allows an optional item to be skipped but enforces evidence once it is answered', () => {
    const optionalPhoto = item({ isRequired: false, photoRequired: true });

    expect(isChecklistRequirementSatisfied(optionalPhoto, 'sum_points', undefined)).toBe(true);
    expect(isChecklistRequirementSatisfied(optionalPhoto, 'sum_points', { checked: true, hasPhoto: false })).toBe(false);
    expect(isChecklistRequirementSatisfied(optionalPhoto, 'sum_points', { checked: true, hasPhoto: true })).toBe(true);
  });

  it('does not complete a required photo item until evidence is attached', () => {
    const requiredPhoto = item({ photoRequired: true });

    expect(isChecklistAnswerComplete(requiredPhoto, 'sum_points', { checked: true, hasPhoto: false })).toBe(false);
    expect(isChecklistAnswerComplete(requiredPhoto, 'sum_points', { checked: true, hasPhoto: true })).toBe(true);
  });

  it('counts only completed required items in learner progress', () => {
    const items = [
      item({ id: 'required-photo', photoRequired: true }),
      item({ id: 'required-plain', order: 1 }),
      item({ id: 'optional', order: 2, isRequired: false }),
    ];
    const results = [
      result({ id: 'r1', itemId: 'required-photo', photoFileName: null }),
      result({ id: 'r2', itemId: 'required-plain' }),
      result({ id: 'r3', itemId: 'optional' }),
    ];

    expect(getRequiredChecklistProgress(items, results, 'sum_points')).toEqual({
      completedRequired: 1,
      requiredCount: 2,
    });
  });
});

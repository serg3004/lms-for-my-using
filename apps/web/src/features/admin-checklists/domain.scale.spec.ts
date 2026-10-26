import { describe, expect, it } from 'vitest';

import {
  SCALE_MAX_LEVELS,
  createScaleLevelDraft,
  describeScaleLevels,
  moveScaleLevelDraft,
  newScaleLevelDrafts,
  scaleDraftToInput,
  scaleLevelDraftsFromLevels,
  validateScaleDraft,
} from './domain.js';

describe('scale editor domain (PR 343)', () => {
  it('starts a new scale with two empty levels worth 0 and 100 points', () => {
    const drafts = newScaleLevelDrafts();
    expect(drafts.map((d) => [d.label, d.score])).toEqual([['', '0'], ['', '100']]);
    expect(new Set(drafts.map((d) => d.key)).size).toBe(2);
  });

  it('orders existing levels by value when opening them for editing', () => {
    const drafts = scaleLevelDraftsFromLevels([
      { value: 3, label: 'High', score: 100 },
      { value: 1, label: 'Low', score: 0 },
    ]);
    expect(drafts.map((d) => d.label)).toEqual(['Low', 'High']);
    expect(drafts.map((d) => d.score)).toEqual(['0', '100']);
  });

  it('renumbers levels 1..n in row order and trims text when building the request', () => {
    const levels = [createScaleLevelDraft(' No ', '0'), createScaleLevelDraft('Yes', '100')];
    expect(scaleDraftToInput(' Yes/No ', levels)).toEqual({
      name: 'Yes/No',
      levels: [{ value: 1, label: 'No', score: 0 }, { value: 2, label: 'Yes', score: 100 }],
    });
  });

  it('moves a level and ignores moves past either end', () => {
    const levels = [createScaleLevelDraft('A', '1'), createScaleLevelDraft('B', '2'), createScaleLevelDraft('C', '3')];
    expect(moveScaleLevelDraft(levels, 2, 'up').map((l) => l.label)).toEqual(['A', 'C', 'B']);
    expect(moveScaleLevelDraft(levels, 0, 'up')).toBe(levels);
    expect(moveScaleLevelDraft(levels, 2, 'down')).toBe(levels);
  });

  describe('validateScaleDraft', () => {
    const ok = [createScaleLevelDraft('No', '0'), createScaleLevelDraft('Yes', '100')];

    it('accepts a named scale with two named levels and whole-number points', () => {
      expect(validateScaleDraft('Yes/No', ok)).toBeNull();
    });

    it('rejects an empty name, too few or too many levels, empty labels', () => {
      expect(validateScaleDraft('  ', ok)).toBe('name');
      expect(validateScaleDraft('S', ok.slice(0, 1))).toBe('tooFewLevels');
      expect(validateScaleDraft('S', Array.from({ length: SCALE_MAX_LEVELS + 1 }, () => createScaleLevelDraft('x', '1')))).toBe('tooManyLevels');
      expect(validateScaleDraft('S', [createScaleLevelDraft('', '0'), createScaleLevelDraft('Yes', '100')])).toBe('label');
    });

    it('rejects points that are empty, negative, fractional or above 1000', () => {
      for (const score of ['', '-1', '1.5', '1001', 'abc']) {
        expect(validateScaleDraft('S', [createScaleLevelDraft('No', score), createScaleLevelDraft('Yes', '100')])).toBe('score');
      }
      expect(validateScaleDraft('S', [createScaleLevelDraft('No', '0'), createScaleLevelDraft('Yes', '1000')])).toBeNull();
    });
  });

  it('describes levels for a tooltip in value order', () => {
    expect(describeScaleLevels([{ value: 2, label: 'Yes', score: 100 }, { value: 1, label: 'No', score: 0 }])).toBe('No (0), Yes (100)');
    expect(describeScaleLevels([])).toBe('');
  });
});

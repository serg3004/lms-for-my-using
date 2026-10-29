import { describe, expect, it } from 'vitest';

import {
  computePreviewResult,
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
      levels: [{ value: 1, label: 'No', score: 0, color: '#E65100' }, { value: 2, label: 'Yes', score: 100, color: '#E65100' }],
    });
  });

  it('PR 369б: new scales start red and green, loaded levels keep their colour, bad colour is refused', () => {
    expect(newScaleLevelDrafts().map((d) => d.color)).toEqual(['#C62828', '#2E7D32']);
    expect(scaleLevelDraftsFromLevels([{ value: 1, label: 'A', score: 1, color: '#123456' }]).map((d) => d.color)).toEqual(['#123456']);
    const ok = [createScaleLevelDraft('No', '0', '#C62828'), createScaleLevelDraft('Yes', '100', '#2E7D32')];
    expect(validateScaleDraft('S', ok)).toBeNull();
    expect(validateScaleDraft('S', [{ ...ok[0]!, color: 'red' }, ok[1]!])).toBe('color');
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


it('previews mixed criterion scales with the same weights and zero-level completion as the server', () => {
  const base = { checklistId: 'c', text: 'Criterion', isRequired: true, photoRequired: false, points: 999 };
  const scale = (score: number) => ({ id: 's', name: 'Scale', levels: [{ value: 7, label: 'No', score: 0 }, { value: 9, label: 'Yes', score }] });
  const items = [{ ...base, id: 'a', order: 0, weight: 2, scale: scale(40) }, { ...base, id: 'b', order: 1, weight: 3, scale: scale(10) }];
  expect(computePreviewResult(items, 'sum_points', [], 70, { a: { scaleLevel: 9 }, b: { scaleLevel: 7 } })).toEqual({ totalScore: 80, maxScore: 110, percentage: 73, passed: true, allAnswered: true });
});

// Partial and skipped responses are preview state, never persisted session results.
describe('observer preview scoring (PR 374)', () => {
  const item = { id: 'a', checklistId: 'c', order: 0, text: 'Safety', points: 3, weight: 2, isRequired: true, photoRequired: false, allowSkip: false };
  const other = { ...item, id: 'b', weight: 1 };
  it('uses answered criteria for partial percentages and keeps the result incomplete', () => {
    expect(computePreviewResult([item, other], 'sum_points', [], 70, { a: { checked: true } }, false, true)).toEqual({ totalScore: 6, maxScore: 6, percentage: 100, passed: false, allAnswered: false });
  });
  it('counts an explicit No as an answered zero and still requires photo evidence', () => {
    expect(computePreviewResult([item], 'sum_points', [], 0, { a: { checked: false, answered: true } }, false, true)).toMatchObject({ totalScore: 0, maxScore: 6, allAnswered: true });
    expect(computePreviewResult([{ ...item, photoRequired: true }], 'sum_points', [], 70, { a: { checked: true } }).allAnswered).toBe(false);
  });
  it('only excludes a skip that the sheet or criterion allows', () => {
    const answers = { a: { skipped: true }, b: { checked: true } };
    expect(computePreviewResult([item, other], 'sum_points', [], 70, answers).allAnswered).toBe(false);
    expect(computePreviewResult([{ ...item, allowSkip: true }, other], 'sum_points', [], 70, answers)).toMatchObject({ totalScore: 3, maxScore: 3, passed: true });
    expect(computePreviewResult([item, other], 'sum_points', [], 70, answers, true).passed).toBe(true);
  });
  it('does not silently accept an unknown scale level', () => {
    expect(computePreviewResult([{ ...item, scale: { id: 's', name: 'S', levels: [{ value: 1, label: 'Good', score: 3 }] } }], 'sum_points', [], 70, { a: { scaleLevel: 99 } }).allAnswered).toBe(false);
  });
});

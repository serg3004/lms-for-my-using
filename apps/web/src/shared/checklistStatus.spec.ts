import { describe, expect, it } from 'vitest';

import { CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT, CHECKLIST_SESSION_STATUS_BADGE_VARIANT, describeChecklistSessionResult } from './checklistStatus.js';

describe('CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT', () => {
  it('covers every ChecklistInstanceStatus value exhaustively', () => {
    // Object.keys can't be checked against the type at runtime, so this pins the exact set of
    // status keys -- if a status is added/removed on the API side without updating this map, the
    // test fails loudly instead of silently falling back to an `undefined` Badge variant.
    expect(Object.keys(CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT).sort()).toEqual(
      ['assigned', 'completed', 'expired', 'in_progress', 'submitted'].sort(),
    );
  });

  it('maps every status to an existing Badge tone variant, not an invented color', () => {
    const knownVariants = new Set(['neutral', 'published', 'draft', 'overdue', 'done', 'new', 'warning', 'success', 'info', 'danger']);
    for (const variant of Object.values(CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT)) {
      expect(knownVariants.has(variant)).toBe(true);
    }
  });

  it('marks a terminal failure state (expired) as danger and success (completed) as success', () => {
    expect(CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT.expired).toBe('danger');
    expect(CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT.completed).toBe('success');
  });
});

describe('CHECKLIST_SESSION_STATUS_BADGE_VARIANT', () => {
  it('covers every ChecklistSessionStatus value exhaustively', () => {
    expect(Object.keys(CHECKLIST_SESSION_STATUS_BADGE_VARIANT).sort()).toEqual(
      ['cancelled', 'completed', 'in_progress', 'paused', 'scheduled'].sort(),
    );
  });

  it('maps every status to an existing Badge tone variant, not an invented color', () => {
    const knownVariants = new Set(['neutral', 'published', 'draft', 'overdue', 'done', 'new', 'warning', 'success', 'info', 'danger']);
    for (const variant of Object.values(CHECKLIST_SESSION_STATUS_BADGE_VARIANT)) {
      expect(knownVariants.has(variant)).toBe(true);
    }
  });

  it('marks cancelled as danger and completed as success, distinctly from the instance mapping', () => {
    expect(CHECKLIST_SESSION_STATUS_BADGE_VARIANT.cancelled).toBe('danger');
    expect(CHECKLIST_SESSION_STATUS_BADGE_VARIANT.completed).toBe('success');
  });
});

describe('describeChecklistSessionResult', () => {
  it('is pending while the instance has not completed, regardless of scored/percentage', () => {
    expect(describeChecklistSessionResult({ instanceStatus: 'in_progress', scored: null, percentage: null, passed: null })).toEqual({
      kind: 'pending',
    });
    expect(describeChecklistSessionResult({ instanceStatus: 'assigned', scored: null, percentage: null, passed: null })).toEqual({
      kind: 'pending',
    });
    expect(describeChecklistSessionResult({ instanceStatus: 'submitted', scored: null, percentage: null, passed: null })).toEqual({
      kind: 'pending',
    });
  });

  it('is notScored (not pending) when the instance completed with every criterion skipped', () => {
    expect(describeChecklistSessionResult({ instanceStatus: 'completed', scored: false, percentage: null, passed: null })).toEqual({
      kind: 'notScored',
    });
  });

  it('is scored with the percentage/passed values when the instance completed with a real score', () => {
    expect(describeChecklistSessionResult({ instanceStatus: 'completed', scored: true, percentage: 80, passed: true })).toEqual({
      kind: 'scored',
      percentage: 80,
      passed: true,
    });
  });
});

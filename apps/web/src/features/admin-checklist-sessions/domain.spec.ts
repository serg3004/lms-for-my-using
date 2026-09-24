import { describe, expect, it } from 'vitest';

import {
  canCancelSession,
  canProceedFromChecklistStep,
  canProceedFromParticipantsStep,
  canProceedFromScheduleStep,
  canReassignObserver,
  canRepeatSession,
  formatParticipantName,
  partitionBulkCreateResults,
} from './domain.js';
import type { BulkCreateChecklistSessionResult, ChecklistSessionStatus } from '../../shared/api/types.js';

describe('canCancelSession', () => {
  it('allows cancelling only a scheduled session', () => {
    expect(canCancelSession({ status: 'scheduled' })).toBe(true);
    for (const status of ['in_progress', 'paused', 'completed', 'cancelled'] as ChecklistSessionStatus[]) {
      expect(canCancelSession({ status })).toBe(false);
    }
  });
});

describe('canRepeatSession', () => {
  it('allows repeating only a terminal session', () => {
    expect(canRepeatSession({ status: 'completed' })).toBe(true);
    expect(canRepeatSession({ status: 'cancelled' })).toBe(true);
    for (const status of ['scheduled', 'in_progress', 'paused'] as ChecklistSessionStatus[]) {
      expect(canRepeatSession({ status })).toBe(false);
    }
  });
});

describe('canReassignObserver', () => {
  it('allows reassigning only a scheduled session (PR 302)', () => {
    expect(canReassignObserver({ status: 'scheduled' })).toBe(true);
    for (const status of ['in_progress', 'paused', 'completed', 'cancelled'] as ChecklistSessionStatus[]) {
      expect(canReassignObserver({ status })).toBe(false);
    }
  });
});

describe('formatParticipantName', () => {
  it('joins first and last name', () => {
    expect(formatParticipantName({ firstName: 'Ann', lastName: 'Lee', email: 'a@x.com' })).toBe('Ann Lee');
  });

  it('falls back to email when no name is set', () => {
    expect(formatParticipantName({ firstName: '', lastName: null, email: 'a@x.com' })).toBe('a@x.com');
  });
});

describe('canProceedFromParticipantsStep', () => {
  it('requires at least one learner and an observer', () => {
    expect(canProceedFromParticipantsStep([], 'obs-1')).toBe(false);
    expect(canProceedFromParticipantsStep(['l-1'], '')).toBe(false);
    expect(canProceedFromParticipantsStep(['l-1'], 'obs-1')).toBe(true);
  });

  it('rejects more than 100 learners', () => {
    const learnerIds = Array.from({ length: 101 }, (_, i) => `l-${i}`);
    expect(canProceedFromParticipantsStep(learnerIds, 'obs-1')).toBe(false);
  });

  it('accepts exactly 100 learners', () => {
    const learnerIds = Array.from({ length: 100 }, (_, i) => `l-${i}`);
    expect(canProceedFromParticipantsStep(learnerIds, 'obs-1')).toBe(true);
  });
});

describe('canProceedFromChecklistStep', () => {
  it('requires a non-blank checklist id', () => {
    expect(canProceedFromChecklistStep('')).toBe(false);
    expect(canProceedFromChecklistStep('   ')).toBe(false);
    expect(canProceedFromChecklistStep('cl-1')).toBe(true);
  });
});

describe('canProceedFromScheduleStep', () => {
  it('lets "now" through without a scheduled time', () => {
    expect(canProceedFromScheduleStep('now', '')).toBe(true);
  });

  it('requires a scheduled time for "later"', () => {
    expect(canProceedFromScheduleStep('later', '')).toBe(false);
    expect(canProceedFromScheduleStep('later', '2026-10-01T09:00')).toBe(true);
  });
});

describe('partitionBulkCreateResults', () => {
  it('splits results by status', () => {
    const result: BulkCreateChecklistSessionResult = {
      created: 1,
      skipped: 1,
      failed: 1,
      results: [
        { learnerId: 'l-1', status: 'created', sessionId: 's-1' },
        { learnerId: 'l-2', status: 'skipped', reason: 'already assigned' },
        { learnerId: 'l-3', status: 'failed', reason: 'not found' },
      ],
    };
    const partitioned = partitionBulkCreateResults(result);
    expect(partitioned.created).toHaveLength(1);
    expect(partitioned.skipped).toHaveLength(1);
    expect(partitioned.failed).toHaveLength(1);
    expect(partitioned.created[0].learnerId).toBe('l-1');
  });
});

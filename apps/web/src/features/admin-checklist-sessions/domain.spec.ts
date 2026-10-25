import { describe, expect, it, vi } from 'vitest';

import {
  activeSessionFilterKeys,
  applySessionFilterChange,
  canCancelSession,
  canProceedFromChecklistStep,
  canProceedFromParticipantsStep,
  canProceedFromScheduleStep,
  buildIndividualSessionSchedules,
  buildSessionUpdatePayload,
  canDeleteSession,
  canMessageParticipant,
  canReassignObserver,
  toDatetimeLocalValue,
  canRepeatSession,
  excludeCurrentObserver,
  formatParticipantName,
  parseSessionFilters,
  partitionBulkCreateResults,
  resolvePeriodScheduledFrom,
  toSessionScheduledAt,
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

describe('excludeCurrentObserver (PR 302 review fix)', () => {
  it('filters the session\'s current observer out of the candidate list', () => {
    const candidates = [
      { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'olga@x.com', position: null },
      { id: 'observer-2', firstName: 'Second', lastName: 'Observer', email: 'second@x.com', position: null },
    ];
    expect(excludeCurrentObserver(candidates, 'observer-1')).toEqual([candidates[1]]);
  });

  it('leaves the list untouched when the current observer is not among the candidates', () => {
    const candidates = [{ id: 'observer-2', firstName: 'Second', lastName: 'Observer', email: 'second@x.com', position: null }];
    expect(excludeCurrentObserver(candidates, 'observer-1')).toEqual(candidates);
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

  it('rejects invalid dates and durations, while preserving optional duration', () => {
    expect(canProceedFromScheduleStep('later', '2026-02-30T09:00')).toBe(false);
    expect(canProceedFromScheduleStep('later', 'not-a-date')).toBe(false);
    for (const duration of ['0', '-1', '1.5', '1441']) expect(canProceedFromScheduleStep('now', '', duration)).toBe(false);
    expect(canProceedFromScheduleStep('now', '', '1440')).toBe(true);
  });
});

describe('individual schedules', () => {
  it('matches schedules by selected employee and ignores stale drafts for removed employees', () => {
    const result = buildIndividualSessionSchedules(['b', 'a'], {
      a: { scheduledAt: '2026-10-01T09:00', durationMinutes: '20' },
      removed: { scheduledAt: 'invalid', durationMinutes: '-1' },
    }, { scheduledAt: '2026-10-02T11:00', durationMinutes: '' }, 'Asia/Almaty');
    expect(result).toEqual([
      { learnerId: 'b', scheduledAt: new Date('2026-10-02T11:00').toISOString(), durationMinutes: null, timezone: 'Asia/Almaty' },
      { learnerId: 'a', scheduledAt: new Date('2026-10-01T09:00').toISOString(), durationMinutes: 20, timezone: 'Asia/Almaty' },
    ]);
  });

  it('requires a valid appointment for every selected employee', () => {
    const fallback = { scheduledAt: '', durationMinutes: '' };
    expect(buildIndividualSessionSchedules([], {}, fallback, 'UTC')).toBeNull();
    expect(buildIndividualSessionSchedules(['a', 'b'], { a: { scheduledAt: '2026-10-01T09:00', durationMinutes: '30' } }, fallback, 'UTC')).toBeNull();
    expect(buildIndividualSessionSchedules(['a'], { a: { scheduledAt: '2026-10-01T09:00', durationMinutes: '0' } }, fallback, 'UTC')).toBeNull();
  });

  it('rejects a nonexistent DST wall time instead of silently scheduling a different hour', () => {
    vi.stubEnv('TZ', 'America/New_York');
    try {
      expect(toSessionScheduledAt('2026-03-08T01:30')).toBe('2026-03-08T06:30:00.000Z');
      expect(toSessionScheduledAt('2026-03-08T02:30')).toBeNull();
      expect(toSessionScheduledAt('2026-03-08T03:30')).toBe('2026-03-08T07:30:00.000Z');
      // The ambiguous autumn hour keeps the browser's existing, earlier-offset behavior.
      expect(toSessionScheduledAt('2026-11-01T01:30')).toBe('2026-11-01T05:30:00.000Z');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// PR 318: the sessions list's "Period" filter card maps onto the `scheduledFrom` query param
// GET /checklist-sessions already accepts -- no new backend filter, just a friendlier control.
describe('resolvePeriodScheduledFrom', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('leaves scheduledFrom unset for "all"', () => {
    expect(resolvePeriodScheduledFrom('all', now)).toBeUndefined();
  });

  it('resolves "last7" to 7 days before now', () => {
    expect(resolvePeriodScheduledFrom('last7', now)).toBe('2026-06-08T12:00:00.000Z');
  });

  it('resolves "last30" to 30 days before now', () => {
    expect(resolvePeriodScheduledFrom('last30', now)).toBe('2026-05-16T12:00:00.000Z');
  });

  it('resolves "quarter" to 90 days before now', () => {
    expect(resolvePeriodScheduledFrom('quarter', now)).toBe('2026-03-17T12:00:00.000Z');
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

describe('session list URL filters (PR 325)', () => {
  it('parses filters from the query string and falls back to defaults for bad values', () => {
    const filters = parseSessionFilters(new URLSearchParams('status=paused&period=bogus&checklistId=c1&departmentId=d1&learnerId=l1&observerId=o1&search=ann&page=3'));
    expect(filters).toEqual({ status: 'paused', period: 'all', checklistId: 'c1', departmentId: 'd1', learnerId: 'l1', observerId: 'o1', search: 'ann', page: 3 });
    expect(parseSessionFilters(new URLSearchParams('page=-2&status=nope')).page).toBe(1);
    expect(parseSessionFilters(new URLSearchParams('page=abc')).status).toBe('all');
  });

  it('sets a filter, drops defaults and resets paging on any filter change', () => {
    const base = new URLSearchParams('status=scheduled&page=4');
    expect(applySessionFilterChange(base, { checklistId: 'c1' }).toString()).toBe('status=scheduled&checklistId=c1');
    expect(applySessionFilterChange(new URLSearchParams('checklistId=c1&page=2'), { checklistId: '' }).toString()).toBe('');
    expect(applySessionFilterChange(new URLSearchParams('status=paused'), { status: 'all' }).toString()).toBe('');
  });

  it('changes only the page when paging', () => {
    expect(applySessionFilterChange(new URLSearchParams('checklistId=c1'), { page: 3 }).toString()).toBe('checklistId=c1&page=3');
    expect(applySessionFilterChange(new URLSearchParams('checklistId=c1&page=3'), { page: 1 }).toString()).toBe('checklistId=c1');
  });

  it('lists active non-status filters for the chips', () => {
    const filters = parseSessionFilters(new URLSearchParams('status=paused&learnerId=l1&period=last7'));
    expect(activeSessionFilterKeys(filters)).toEqual(['period', 'learnerId']);
    expect(activeSessionFilterKeys(parseSessionFilters(new URLSearchParams('status=paused')))).toEqual([]);
  });
});

describe('session edit/delete/message guards (PR 333)', () => {
  it('only a scheduled session can be deleted; only an unfinished one can be messaged', () => {
    expect(canDeleteSession({ status: 'scheduled' })).toBe(true);
    for (const status of ['in_progress', 'paused', 'completed', 'cancelled'] as const) expect(canDeleteSession({ status })).toBe(false);
    for (const status of ['scheduled', 'in_progress', 'paused'] as const) expect(canMessageParticipant({ status })).toBe(true);
    for (const status of ['completed', 'cancelled'] as const) expect(canMessageParticipant({ status })).toBe(false);
  });

  it('round-trips a session time through the datetime-local value', () => {
    const iso = new Date(2026, 1, 3, 9, 30).toISOString();
    expect(toDatetimeLocalValue(iso)).toBe('2026-02-03T09:30');
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('not a date')).toBe('');
  });

  describe('buildSessionUpdatePayload', () => {
    const iso = new Date(2026, 1, 3, 9, 30).toISOString();
    const session = { version: 4, scheduledAt: iso, observerId: 'observer-1' };

    it('has nothing to save while the draft equals the session', () => {
      expect(buildSessionUpdatePayload(session, { scheduledAt: '2026-02-03T09:30', observerId: '' }, 'Asia/Almaty')).toBeNull();
      expect(buildSessionUpdatePayload(session, { scheduledAt: '', observerId: 'observer-1' }, 'Asia/Almaty')).toBeNull();
    });

    it('sends a changed time together with the timezone, and the version', () => {
      const payload = buildSessionUpdatePayload(session, { scheduledAt: '2026-02-04T10:00', observerId: '' }, 'Asia/Almaty');
      expect(payload).toEqual({ version: 4, scheduledAt: new Date(2026, 1, 4, 10, 0).toISOString(), timezone: 'Asia/Almaty' });
    });

    it('sends time and observer in one payload, and only the observer when only it changed', () => {
      expect(buildSessionUpdatePayload(session, { scheduledAt: '2026-02-04T10:00', observerId: 'observer-2' }, 'UTC')).toMatchObject({ observerId: 'observer-2', timezone: 'UTC' });
      expect(buildSessionUpdatePayload(session, { scheduledAt: '2026-02-03T09:30', observerId: 'observer-2' }, 'UTC')).toEqual({ version: 4, observerId: 'observer-2' });
    });
  });
});

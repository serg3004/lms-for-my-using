import { jest } from '@jest/globals';

import {
  createIncompleteAfterStartReminder,
  INCOMPLETE_AFTER_START_REMINDER_DELAY_MS,
  PRE_START_REMINDER_LEAD_MS,
  suppressPendingReminders,
  upsertPreStartReminder,
} from './checklist-session-reminders.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const sessionId = '22222222-2222-2222-2222-222222222222';

function createTx(overrides: { updateManyCount?: number } = {}) {
  return {
    checklistSessionReminder: {
      updateMany: jest.fn(async () => ({ count: overrides.updateManyCount ?? 0 })),
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => args.create),
    },
  } as unknown as Parameters<typeof upsertPreStartReminder>[0];
}

// PR 303 (Timezone contract): reminder scheduling is deliberately instant-based -- a fixed
// millisecond offset subtracted from the session's own `scheduledAt` (itself an absolute UTC
// instant), never "N wall-clock hours before" computed against a local calendar/timezone. These
// tests exist specifically to pin that contract down: they'd fail if a future change started
// doing timezone-aware calendar arithmetic that could drift across a DST boundary.
describe('checklist session reminder scheduling is instant-based, not local-calendar-based (PR 303)', () => {
  it('upsertPreStartReminder subtracts exactly 24h in real elapsed time, not 24 local wall-clock hours', async () => {
    // 2026-03-08 07:00 UTC = 2026-03-08 02:00 EST, the instant the US DST spring-forward begins
    // (clocks jump from 2:00 AM to 3:00 AM). A session scheduled exactly at this instant must
    // still get a reminder exactly PRE_START_REMINDER_LEAD_MS earlier in absolute terms.
    const scheduledAt = new Date('2026-03-08T07:00:00.000Z');
    const tx = createTx();

    await upsertPreStartReminder(tx, { organizationId, sessionId, scheduledAt });

    const upsertCall = (tx.checklistSessionReminder.upsert as jest.Mock).mock.calls[0]?.[0] as {
      create: { scheduledFor: Date };
    };
    expect(upsertCall.create.scheduledFor.getTime()).toBe(scheduledAt.getTime() - PRE_START_REMINDER_LEAD_MS);
  });

  it('createIncompleteAfterStartReminder adds exactly 24h in real elapsed time across a DST boundary', async () => {
    // A session started right before the spring-forward transition; the reminder fires exactly
    // 24 real hours later, which is 23 *local* wall-clock hours later in America/New_York --
    // proving the math never round-trips through a local calendar representation.
    const startedAt = new Date('2026-03-08T06:00:00.000Z');
    const tx = createTx();

    await createIncompleteAfterStartReminder(tx, { organizationId, sessionId, startedAt });

    const upsertCall = (tx.checklistSessionReminder.upsert as jest.Mock).mock.calls[0]?.[0] as {
      create: { scheduledFor: Date };
    };
    expect(upsertCall.create.scheduledFor.getTime()).toBe(startedAt.getTime() + INCOMPLETE_AFTER_START_REMINDER_DELAY_MS);
  });

  it('rescheduling across a DST boundary moves the pre_start reminder by exactly the new instant delta', async () => {
    // Reschedule from before the transition to after it -- a naive "add N local hours" approach
    // would be off by an hour here; the instant-based subtraction never is.
    const before = new Date('2026-03-07T15:00:00.000Z');
    const after = new Date('2026-03-09T15:00:00.000Z');
    const tx = createTx({ updateManyCount: 1 });

    await upsertPreStartReminder(tx, { organizationId, sessionId, scheduledAt: before });
    await upsertPreStartReminder(tx, { organizationId, sessionId, scheduledAt: after });

    const updateManyCalls = (tx.checklistSessionReminder.updateMany as jest.Mock).mock.calls as Array<
      [{ data: { scheduledFor: Date } }]
    >;
    expect(updateManyCalls[1]?.[0].data.scheduledFor.getTime()).toBe(after.getTime() - PRE_START_REMINDER_LEAD_MS);
    expect(updateManyCalls[1]?.[0].data.scheduledFor.getTime() - updateManyCalls[0]?.[0].data.scheduledFor.getTime())
      .toBe(after.getTime() - before.getTime());
  });

  it('clearing the schedule (scheduledAt: null) suppresses the pending pre_start reminder instead of computing a time', async () => {
    const tx = createTx();
    await upsertPreStartReminder(tx, { organizationId, sessionId, scheduledAt: null });

    expect(tx.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId, sessionId, status: 'pending', reminderType: 'pre_start' }) }),
    );
  });
});

describe('suppressPendingReminders', () => {
  it('suppresses all pending reminder types when no reminderType filter is given', async () => {
    const tx = createTx({ updateManyCount: 2 });
    const count = await suppressPendingReminders(tx, { organizationId, sessionId });
    expect(count).toBe(2);
    expect(tx.checklistSessionReminder.updateMany).toHaveBeenCalledWith({
      where: { organizationId, sessionId, status: 'pending' },
      data: { status: 'suppressed' },
    });
  });
});

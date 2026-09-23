import type { Prisma } from '@prisma/client';

// PR 291: two recurring reminder types, distinct from ChecklistDeadlineWorker's overdue-instance
// expiry (checklist-deadlines.ts) -- these fire on the ChecklistSession lifecycle, not on
// ChecklistInstance.dueAt, and coexist with it as a separate recurring job.
export const PRE_START_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
export const INCOMPLETE_AFTER_START_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

type ReminderTransactionClient = Prisma.TransactionClient;

/**
 * A session's `pre_start` reminder tracks its own `scheduledAt` 1:1 -- created when a schedule is
 * first set, moved when the session is rescheduled, and suppressed when the schedule is cleared.
 * The unique `(sessionId, reminderType)` constraint (PR 288) means only one such row can ever
 * exist, so this is upsert-shaped, but only touches the row while it's still `pending`: once a
 * reminder has fired (or been suppressed), rescheduling doesn't resurrect it -- that would be
 * re-sending a notification for an instant that already passed.
 */
export async function upsertPreStartReminder(
  tx: ReminderTransactionClient,
  input: { organizationId: string; sessionId: string; scheduledAt: Date | null },
): Promise<void> {
  if (input.scheduledAt === null) {
    await suppressPendingReminders(tx, {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      reminderType: 'pre_start',
    });
    return;
  }

  const scheduledFor = new Date(input.scheduledAt.getTime() - PRE_START_REMINDER_LEAD_MS);

  const updated = await tx.checklistSessionReminder.updateMany({
    where: { sessionId: input.sessionId, reminderType: 'pre_start', status: 'pending' },
    data: { scheduledFor },
  });
  if (updated.count > 0) return;

  await tx.checklistSessionReminder.upsert({
    where: { sessionId_reminderType: { sessionId: input.sessionId, reminderType: 'pre_start' } },
    create: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      reminderType: 'pre_start',
      status: 'pending',
      scheduledFor,
    },
    // The row exists but isn't pending (already sent/suppressed) -- leave its outcome alone.
    update: {},
  });
}

/** Created exactly once, the moment a session actually starts -- never re-created on resume. */
export async function createIncompleteAfterStartReminder(
  tx: ReminderTransactionClient,
  input: { organizationId: string; sessionId: string; startedAt: Date },
): Promise<void> {
  await tx.checklistSessionReminder.upsert({
    where: { sessionId_reminderType: { sessionId: input.sessionId, reminderType: 'incomplete_after_start' } },
    create: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      reminderType: 'incomplete_after_start',
      status: 'pending',
      scheduledFor: new Date(input.startedAt.getTime() + INCOMPLETE_AFTER_START_REMINDER_DELAY_MS),
    },
    update: {},
  });
}

/**
 * A terminal session (completed/cancelled) must never emit a reminder that's still pending --
 * this is the DB-level guard the "terminal session doesn't get a reminder" criterion depends on,
 * independent of the worker's own terminal-status check at delivery time (belt-and-suspenders,
 * same reasoning as the session state machine's own race-safety).
 */
export async function suppressPendingReminders(
  tx: ReminderTransactionClient,
  input: { organizationId: string; sessionId: string; reminderType?: 'pre_start' | 'incomplete_after_start' },
): Promise<number> {
  const result = await tx.checklistSessionReminder.updateMany({
    where: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      status: 'pending',
      ...(input.reminderType ? { reminderType: input.reminderType } : {}),
    },
    data: { status: 'suppressed' },
  });
  return result.count;
}

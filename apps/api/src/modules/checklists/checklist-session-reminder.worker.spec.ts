import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import { OutboxService } from '../outbox/public.js';
import { ChecklistSessionReminderDelivery } from './checklist-session-reminder-delivery.js';
import {
  CHECKLIST_SESSION_REMINDER_JOB,
  CHECKLIST_SESSION_REMINDER_NOTIFY_JOB,
  CHECKLIST_SESSION_REMINDER_SCHEDULER,
  ChecklistSessionReminderWorker,
} from './checklist-session-reminder.worker.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const sessionId = '22222222-2222-2222-2222-222222222222';
const observerId = '33333333-3333-3333-3333-333333333333';
const reminderId = '44444444-4444-4444-4444-444444444444';

function dueReminder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: reminderId,
    organizationId,
    sessionId,
    reminderType: 'pre_start' as const,
    ...overrides,
  };
}

/**
 * `runInTransaction` here mirrors OutboxService's real contract: the operation runs against a
 * `tx` (same mock object as `prisma`) plus an `emit` that records events, and the fake's own
 * table mocks are shared, so assertions can check calls made inside the callback directly.
 */
function createHarness(overrides: {
  reminders?: unknown[];
  session?: Record<string, unknown> | null;
  claimCount?: number;
} = {}) {
  const emitted: Array<{ topic: string; payload: unknown }> = [];
  const prisma: Record<string, unknown> = {
    checklistSessionReminder: {
      findMany: jest.fn(async () => overrides.reminders ?? [dueReminder()]),
      updateMany: jest.fn(async () => ({ count: overrides.claimCount ?? 1 })),
    },
    checklistSession: {
      findUnique: jest.fn(async () =>
        overrides.session === undefined
          ? { id: sessionId, observerId, status: 'scheduled' }
          : overrides.session,
      ),
    },
    checklistSessionEvent: { create: jest.fn(async () => ({})) },
    notification: { create: jest.fn(async () => ({})) },
  };

  const backgroundJobs = {
    handlers: new Map<string, (job: { id: string; name: string; data: Record<string, unknown>; attemptsMade: number }) => Promise<void>>(),
    recurring: [] as Array<{ name: string; data: unknown; options: unknown }>,
    registerHandler: jest.fn((name: string, handler: (job: never) => Promise<void>) => {
      (backgroundJobs.handlers as Map<string, unknown>).set(name, handler as never);
    }),
    registerRecurring: jest.fn((name: string, data: unknown, options: unknown) => {
      backgroundJobs.recurring.push({ name, data, options });
    }),
  };

  const outbox = {
    runInTransaction: jest.fn(async (operation: (tx: unknown, emit: (event: { topic: string; payload: unknown }) => Promise<void>) => Promise<unknown>) =>
      operation(prisma, async (event) => {
        emitted.push(event);
      }),
    ),
  };

  const delivery = { send: jest.fn(async () => undefined) };

  const worker = new ChecklistSessionReminderWorker(
    prisma as unknown as PrismaService,
    backgroundJobs as unknown as BackgroundJobsService,
    outbox as unknown as OutboxService,
    delivery as unknown as ChecklistSessionReminderDelivery,
  );

  return { worker, prisma, backgroundJobs, outbox, delivery, emitted };
}

describe('ChecklistSessionReminderWorker', () => {
  describe('onModuleInit', () => {
    it('registers the recurring job, its handler, and the notify handler under distinct names from ChecklistDeadlineWorker', () => {
      const { worker, backgroundJobs } = createHarness();

      worker.onModuleInit();

      expect(backgroundJobs.registerHandler).toHaveBeenCalledWith(CHECKLIST_SESSION_REMINDER_JOB, expect.any(Function));
      expect(backgroundJobs.registerHandler).toHaveBeenCalledWith(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB, expect.any(Function));
      expect(backgroundJobs.recurring).toEqual([
        expect.objectContaining({ name: CHECKLIST_SESSION_REMINDER_JOB, options: expect.objectContaining({ schedulerId: CHECKLIST_SESSION_REMINDER_SCHEDULER }) }),
      ]);
      expect(CHECKLIST_SESSION_REMINDER_JOB).not.toBe('checklists.expire-overdue');
      expect(CHECKLIST_SESSION_REMINDER_SCHEDULER).not.toBe('checklists-expire-overdue-v1');
    });
  });

  describe('processDue', () => {
    it('sends a due reminder for a non-terminal session: claims it, records the event, notifies, and emits for email delivery', async () => {
      const { worker, prisma, emitted } = createHarness();

      const sent = await worker.processDue(new Date('2026-10-01T00:00:00.000Z'));

      expect(sent).toBe(1);
      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith({
        where: { id: reminderId, status: 'pending' },
        data: { status: 'sent', sentAt: new Date('2026-10-01T00:00:00.000Z') },
      });
      expect(prisma.checklistSessionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'reminder_sent', sessionId }) }),
      );
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: observerId, type: 'checklist_session_pre_start_reminder' }) }),
      );
      expect(emitted).toEqual([
        {
          topic: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB,
          payload: { reminderId, sessionId, organizationId, observerId, reminderType: 'pre_start' },
        },
      ]);
    });

    it('suppresses (does not send) a reminder whose session has already completed', async () => {
      const { worker, prisma, outbox } = createHarness({ session: { id: sessionId, observerId, status: 'completed' } });

      const sent = await worker.processDue();

      expect(sent).toBe(0);
      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith({
        where: { id: reminderId, status: 'pending' },
        data: { status: 'suppressed' },
      });
      expect(outbox.runInTransaction).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('suppresses a reminder whose session has been cancelled', async () => {
      const { worker, prisma } = createHarness({ session: { id: sessionId, observerId, status: 'cancelled' } });

      const sent = await worker.processDue();

      expect(sent).toBe(0);
      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'suppressed' } }),
      );
    });

    it('suppresses an orphaned reminder whose session no longer exists', async () => {
      const { worker, prisma } = createHarness({ session: null });

      const sent = await worker.processDue();

      expect(sent).toBe(0);
      expect(prisma.checklistSessionReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'suppressed' } }),
      );
    });

    it('treats a lost claim race as already-handled: no duplicate event/notification', async () => {
      const { worker, prisma } = createHarness({ claimCount: 0 });

      const sent = await worker.processDue();

      expect(sent).toBe(0);
      expect(prisma.checklistSessionEvent.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('uses the incomplete_after_start notification type for that reminder type', async () => {
      const { worker, prisma } = createHarness({ reminders: [dueReminder({ reminderType: 'incomplete_after_start' })] });

      await worker.processDue();

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'checklist_session_incomplete_after_start_reminder' }) }),
      );
    });
  });

  describe('notify job handler (email delivery)', () => {
    it('forwards a well-formed payload to the delivery adapter', async () => {
      const { worker, backgroundJobs, delivery } = createHarness();
      worker.onModuleInit();
      const handler = backgroundJobs.handlers.get(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB)!;

      await handler({
        id: 'job-1',
        name: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB,
        attemptsMade: 0,
        data: { reminderId, sessionId, organizationId, observerId, reminderType: 'pre_start' },
      });

      expect(delivery.send).toHaveBeenCalledWith({ organizationId, sessionId, observerId, reminderType: 'pre_start' });
    });

    it('drops a malformed payload without calling the delivery adapter (absence of email must not break the workflow)', async () => {
      const { worker, backgroundJobs, delivery } = createHarness();
      worker.onModuleInit();
      const handler = backgroundJobs.handlers.get(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB)!;

      await handler({ id: 'job-2', name: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB, attemptsMade: 0, data: { sessionId } });

      expect(delivery.send).not.toHaveBeenCalled();
    });

    // PR 306 anomaly #13: a failed delivery must not be swallowed -- ChecklistSessionReminderDelivery
    // already re-throws (see checklist-session-reminder-delivery.ts's catch block), and this worker
    // must let that propagate rather than catching it, so BackgroundJobsService's own queue-level
    // retry (attempts/backoffMs, same mechanism as every other job in this worker) actually gets a
    // chance to run. Swallowing the error here would silently turn a transient delivery failure into
    // a permanently un-retried, un-logged drop.
    it('propagates a delivery failure instead of swallowing it, so the job queue retries the notify job', async () => {
      const { worker, backgroundJobs, delivery } = createHarness();
      const deliveryError = new Error('delivery provider returned status 503');
      delivery.send.mockRejectedValueOnce(deliveryError);
      worker.onModuleInit();
      const handler = backgroundJobs.handlers.get(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB)!;

      await expect(
        handler({
          id: 'job-3',
          name: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB,
          attemptsMade: 0,
          data: { reminderId, sessionId, organizationId, observerId, reminderType: 'pre_start' },
        }),
      ).rejects.toThrow(deliveryError);
    });

    it('succeeds on a retried attempt after a first delivery failure, with no state to duplicate on the retry', async () => {
      const { worker, backgroundJobs, delivery } = createHarness();
      delivery.send.mockRejectedValueOnce(new Error('delivery provider returned status 503'));
      worker.onModuleInit();
      const handler = backgroundJobs.handlers.get(CHECKLIST_SESSION_REMINDER_NOTIFY_JOB)!;
      const payload = { id: 'job-4', name: CHECKLIST_SESSION_REMINDER_NOTIFY_JOB, attemptsMade: 0, data: { reminderId, sessionId, organizationId, observerId, reminderType: 'pre_start' } };

      await expect(handler(payload)).rejects.toThrow();
      // A retried attempt is just another call to the same idempotent handler -- deliverEmail
      // holds no state of its own (the ChecklistSessionReminder row was already marked "sent"
      // before this job was even enqueued), so a second attempt after a transient failure is safe
      // and simply forwards the same payload again.
      await expect(handler({ ...payload, attemptsMade: 1 })).resolves.toBeUndefined();
      expect(delivery.send).toHaveBeenCalledTimes(2);
    });
  });
});
